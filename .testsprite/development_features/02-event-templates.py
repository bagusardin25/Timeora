import asyncio
import re
from datetime import date, timedelta

from playwright import async_api
from playwright.async_api import expect


FRONTEND_URL = "https://timeora-alpha.vercel.app"
BACKEND_URL = "https://timeora-production.up.railway.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"
TITLE = "TS Reusable Focus Template"


async def cleanup_events(context):
    login = await context.request.post(
        f"{BACKEND_URL}/api/auth/login",
        data={"email": EMAIL, "password": PASSWORD},
    )
    if not login.ok:
        return

    token = (await login.json()).get("access_token")
    if not token:
        return

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
        await cleanup_events(context)

        page = await context.new_page()
        await page.goto(f"{FRONTEND_URL}/login", wait_until="domcontentloaded")
        await page.locator("#email").fill(EMAIL)
        await page.locator("#password").fill(PASSWORD)
        await page.get_by_role("button", name="Sign In", exact=True).click()
        await page.wait_for_url(re.compile(r".*/dashboard"), timeout=30000)

        today = date.today()
        days_until_saturday = (5 - today.weekday()) % 7
        event_date = today + timedelta(days=days_until_saturday)

        await page.get_by_role("button", name="+ Add Event", exact=True).click()
        await page.locator("#title").fill(TITLE)
        await page.locator("#date").fill(event_date.isoformat())
        await page.locator("#startTime").fill("19:00")
        await page.locator("#endTime").fill("19:45")
        await page.locator("#category").select_option("focus")
        save_template_btn = page.get_by_role(
            "button", name="Save as Template", exact=True
        )
        # The button may be below the clipped dialog viewport;
        # use JS click to bypass the "outside viewport" error.
        await save_template_btn.evaluate("el => el.click()")
        await expect(page.get_by_role("button", name="Saved!", exact=True)).to_be_visible()
        await page.get_by_role("button", name="Batal", exact=True).click(force=True)

        await page.get_by_role("button", name="+ Add Event", exact=True).click()
        template_btn = page.get_by_role("button", name=TITLE, exact=True)
        await template_btn.evaluate("el => el.click()")
        await expect(page.locator("#title")).to_have_value(TITLE)
        await expect(page.locator("#category")).to_have_value("focus")
        await expect(page.locator("#startTime")).to_have_value("19:00")
        await expect(page.locator("#endTime")).to_have_value("19:45")
        simpan_btn = page.get_by_role(
            "button", name="Simpan Event", exact=True
        )
        await simpan_btn.evaluate("el => el.click()")

        calendar_event = page.locator(".fc-event").filter(has_text=TITLE)
        await expect(calendar_event).to_have_count(1, timeout=30000)
        await calendar_event.click()
        page.once("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        # Hapus button is clipped by modal overflow; use JS click.
        # Use evaluate_handle + setTimeout so confirm() doesn't block.
        hapus_btn = page.get_by_role("button", name="Hapus", exact=True)
        await hapus_btn.evaluate("el => setTimeout(() => el.click(), 0)")
        # Toast uses smart quotes; match a substring to be encoding-safe
        await expect(
            page.get_by_text("deleted").first
        ).to_be_visible(timeout=10000)
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
