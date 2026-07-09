"""Coverage: Rich event details — fixed script with unique title selectors."""
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
        await page.locator("#title").fill("TS Rich Details Event")
        await page.locator("#description").fill("Agenda notes for TestSprite rich details")
        await page.locator("#priority").select_option("important")
        await page.locator("#reminder").select_option("15")
        await page.get_by_role("button", name="Save Event", exact=True).click()
        await page.wait_for_timeout(4000)

        event = page.locator('[data-timeora-event-title="TS Rich Details Event"]').first
        await expect(event).to_be_visible(timeout=20000)
        await event.click()
        await page.wait_for_timeout(1500)

        await expect(page.locator("#title")).to_have_value("TS Rich Details Event", timeout=10000)
        await expect(page.locator("#description")).to_have_value(
            "Agenda notes for TestSprite rich details", timeout=5000
        )
        # Close without delete (avoids confirm dialog traps)
        close_btn = page.get_by_role("button", name="Close", exact=True)
        if await close_btn.count() > 0:
            await close_btn.first.click()
        else:
            await page.get_by_role("button", name="Cancel", exact=True).click()
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
