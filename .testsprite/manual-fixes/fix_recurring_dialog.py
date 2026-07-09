"""Coverage: New Event dialog Weekly Recurrence — strict pass path, no cleanup."""
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
        context.set_default_timeout(25000)
        page = await context.new_page()

        await page.goto("https://timeora-alpha.vercel.app/login", wait_until="domcontentloaded")
        await page.locator("#email").fill("demo@timeora.app")
        await page.locator("#password").fill("TimeoraDemo123!")
        await page.get_by_role("button", name="Sign in", exact=True).click()
        await page.wait_for_url("**/dashboard**", timeout=25000)

        await page.get_by_role("button", name="+ Add Event", exact=True).click()
        title = page.locator("#title")
        await title.wait_for(state="visible")
        await title.fill("TS Dialog Weekly")

        rec = page.locator("#recurrence")
        await expect(rec).to_be_visible(timeout=15000)
        await rec.select_option(label="Weekly")

        await page.get_by_role("button", name="Save Event", exact=True).click()
        # Wait for dialog to close / calendar refresh
        await page.wait_for_timeout(5000)

        # Prefer data attribute; fallback to text on calendar
        by_attr = page.locator('[data-timeora-event-title="TS Dialog Weekly"]')
        by_text = page.get_by_text("TS Dialog Weekly", exact=False)
        if await by_attr.count() > 0:
            await expect(by_attr.first).to_be_visible(timeout=20000)
        else:
            await expect(by_text.first).to_be_visible(timeout=20000)
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
