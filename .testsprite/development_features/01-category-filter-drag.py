import asyncio
import re
from datetime import date, timedelta

from playwright import async_api
from playwright.async_api import expect


FRONTEND_URL = "https://timeora-alpha.vercel.app"
BACKEND_URL = "https://timeora-production.up.railway.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"
TITLE = "TS Development Category Event"


async def authenticate(context):
    login = await context.request.post(
        f"{BACKEND_URL}/api/auth/login",
        data={"email": EMAIL, "password": PASSWORD},
    )
    if not login.ok:
        raise AssertionError(f"Demo login failed with HTTP {login.status}")

    token = (await login.json()).get("access_token")
    if not token:
        raise AssertionError("Demo login response did not contain an access token")
    return token


async def cleanup_events(context, token=None):
    token = token or await authenticate(context)

    headers = {"Authorization": f"Bearer {token}"}
    response = await context.request.get(
        f"{BACKEND_URL}/api/events",
        params={"q": TITLE},
        headers=headers,
    )
    if not response.ok:
        return

    for event in await response.json():
        if event.get("title") == TITLE and event.get("id"):
            await context.request.delete(
                f"{BACKEND_URL}/api/events/{event['id']}",
                headers=headers,
            )


async def create_focus_event(context, token):
    headers = {"Authorization": f"Bearer {token}"}
    today = date.today()
    week_start = today - timedelta(days=(today.weekday() + 1) % 7)

    for day_offset in range(7):
        event_date = week_start + timedelta(days=day_offset)
        for hour in (6, 8, 18, 21):
            response = await context.request.post(
                f"{BACKEND_URL}/api/events",
                data={
                    "title": TITLE,
                    "date": event_date.isoformat(),
                    "start_time": f"{hour:02d}:00:00",
                    "duration_minutes": 45,
                    "participants": "",
                    "category": "focus",
                },
                headers=headers,
            )
            if response.status == 201:
                return await response.json()
            if response.status != 409:
                raise AssertionError(
                    f"Event create failed with HTTP {response.status}: "
                    f"{await response.text()}"
                )

    raise AssertionError("Could not find a conflict-free slot in the current week")


async def run_test():
    pw = None
    browser = None
    context = None

    try:
        pw = await async_api.async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1440,1000",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process",
            ],
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 1000})
        context.set_default_timeout(20000)
        token = await authenticate(context)
        await cleanup_events(context, token)
        created = await create_focus_event(context, token)

        page = await context.new_page()
        await page.goto(f"{FRONTEND_URL}/login", wait_until="domcontentloaded")
        await page.locator("#email").fill(EMAIL)
        await page.locator("#password").fill(PASSWORD)
        await page.get_by_role("button", name="Sign In", exact=True).click()
        await page.wait_for_url(re.compile(r".*/dashboard"), timeout=30000)
        await page.get_by_role("button", name="+ Add Event", exact=True).wait_for()

        calendar_event = page.locator(".fc-event").filter(has_text=TITLE)
        await expect(calendar_event).to_have_count(1, timeout=30000)
        # Verify data attributes are present on .fc-event wrapper
        await expect(calendar_event).to_have_attribute(
            "data-timeora-event-id", created["id"]
        )
        await expect(calendar_event).to_have_attribute(
            "data-timeora-category", "focus"
        )
        await calendar_event.click()
        await expect(page.locator("#category")).to_have_value("focus")
        await page.get_by_role("button", name="Batal", exact=True).click(force=True)

        focus_chip = page.get_by_role(
            "button", name=re.compile(r".*Focus Work.*")
        ).first
        await focus_chip.click()
        await expect(
            page.locator(".fc-event").filter(has_text=TITLE)
        ).to_have_count(0)

        await focus_chip.click()
        calendar_event = page.locator(".fc-event").filter(has_text=TITLE)
        await expect(calendar_event).to_have_count(1)

        personal_chip = page.get_by_role(
            "button", name=re.compile(r".*Personal.*")
        ).first
        # Use data-timeora-event-id for stable drag handle targeting
        event_drag_handle = calendar_event.locator(
            f'[data-timeora-event-id="{created["id"]}"]'
        )
        # Playwright's drag_to uses pointer events which FullCalendar
        # intercepts.  Fire native HTML5 DragEvents with a real DataTransfer
        # so React's onDragStart / onDrop actually fire.
        event_id = created["id"]
        await page.evaluate(
            """([srcSel, eventId]) => {
                const src = document.querySelector(srcSel);
                const dst = Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Personal'));
                if (!src) throw new Error('drag source not found: ' + srcSel);
                if (!dst) throw new Error('Personal chip button not found');
                const dt = new DataTransfer();
                dt.setData('text/plain', eventId);
                dt.effectAllowed = 'move';
                src.dispatchEvent(new DragEvent('dragstart', {
                    bubbles: true, cancelable: true, dataTransfer: dt }));
                dst.dispatchEvent(new DragEvent('dragover', {
                    bubbles: true, cancelable: true, dataTransfer: dt }));
                dst.dispatchEvent(new DragEvent('drop', {
                    bubbles: true, cancelable: true, dataTransfer: dt }));
                src.dispatchEvent(new DragEvent('dragend', {
                    bubbles: true, cancelable: true, dataTransfer: dt }));
            }""",
            [
                f'[data-timeora-event-id="{event_id}"]',
                event_id,
            ],
        )
        headers = {"Authorization": f"Bearer {token}"}
        persisted = None
        for _ in range(10):
            response = await context.request.get(
                f"{BACKEND_URL}/api/events/{created['id']}",
                headers=headers,
            )
            if response.ok:
                persisted = await response.json()
                if persisted.get("category") == "personal":
                    break
            await asyncio.sleep(1)
        assert persisted and persisted.get("category") == "personal", (
            "Dragging the event to Personal did not persist the category"
        )

        # Reload to force FullCalendar to re-mount events with fresh data
        await page.reload(wait_until="domcontentloaded")
        await page.get_by_role("button", name="+ Add Event", exact=True).wait_for()

        calendar_event = page.locator(".fc-event").filter(has_text=TITLE)
        await expect(calendar_event).to_have_count(1, timeout=30000)
        # Verify data-timeora-category updated on the DOM element
        await expect(calendar_event).to_have_attribute(
            "data-timeora-category", "personal", timeout=15000
        )
        await calendar_event.click()
        await expect(page.locator("#category")).to_have_value("personal")
        await page.get_by_role("button", name="Batal", exact=True).click(force=True)

        await context.request.delete(
            f"{BACKEND_URL}/api/events/{created['id']}",
            headers=headers,
        )
        await page.reload(wait_until="domcontentloaded")
        await expect(
            page.locator(".fc-event").filter(has_text=TITLE)
        ).to_have_count(0)
    finally:
        if context:
            try:
                await cleanup_events(context)
            except Exception:
                pass
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
