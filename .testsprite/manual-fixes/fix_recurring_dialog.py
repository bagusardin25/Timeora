"""Coverage: Create weekly recurring event from dialog — fixed script."""
import asyncio
from playwright.async_api import async_playwright, expect


async def run_test():
    pw = browser = context = None
    try:
        pw = await async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=["--window-size=1280,720", "--disable-dev-shm-usage", "--ipc=host", "--single-process"],
        )
        context = await browser.new_context()
        context.set_default_timeout(20000)
        page = await context.new_page()

        await page.goto("https://timeora-alpha.vercel.app/login", wait_until="domcontentloaded")
        await page.locator("#email").fill("demo@timeora.app")
        await page.locator("#password").fill("TimeoraDemo123!")
        await page.get_by_role("button", name="Sign in", exact=True).click()
        await page.wait_for_url("**/dashboard**", timeout=20000)

        await page.get_by_role("button", name="+ Add Event", exact=True).click()
        await page.locator("#title").wait_for(state="visible")
        await page.locator("#title").fill("TS Weekly Recurring")

        # Select Weekly recurrence (product UI: Repeats / Recurrence)
        rec = page.locator("#recurrence")
        await rec.wait_for(state="visible", timeout=10000)
        await rec.select_option("weekly")

        await page.get_by_role("button", name="Save Event", exact=True).click()
        await page.wait_for_timeout(4000)

        # At least one calendar event with this title
        event_link = page.locator('[data-timeora-event-title="TS Weekly Recurring"]').first
        await expect(event_link).to_be_visible(timeout=20000)
        await expect(event_link).to_contain_text("TS Weekly Recurring", timeout=5000)
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
