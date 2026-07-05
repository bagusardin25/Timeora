import asyncio
import re

from playwright import async_api
from playwright.async_api import expect


FRONTEND_URL = "https://timeora-alpha.vercel.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"


async def run_test():
    pw = None
    browser = None
    context = None

    try:
        pw = await async_api.async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,900",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process",
            ],
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        context.set_default_timeout(20000)
        page = await context.new_page()

        await page.goto(f"{FRONTEND_URL}/login", wait_until="domcontentloaded")
        await page.locator("#email").fill(EMAIL)
        await page.locator("#password").fill(PASSWORD)
        await page.get_by_role("button", name="Sign In", exact=True).click()
        await page.wait_for_url(re.compile(r".*/dashboard"), timeout=30000)

        await page.goto(f"{FRONTEND_URL}/profile", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="Preferences")).to_be_visible()
        await expect(page.get_by_text("Export All Data", exact=True)).to_be_visible()

        timezone = page.locator('input[placeholder="e.g. Asia/Jakarta"]')
        duration = page.locator('input[type="number"]')
        time_inputs = page.locator('input[type="time"]')

        await timezone.fill("Asia/Jakarta")
        await duration.fill("45")
        await time_inputs.nth(0).fill("08:00")
        await time_inputs.nth(1).fill("18:00")
        await page.get_by_role("button", name="Save Changes", exact=True).click()
        await expect(
            page.get_by_text("Preferences saved successfully!", exact=True)
        ).to_be_visible()

        await page.reload(wait_until="domcontentloaded")
        await expect(timezone).to_have_value("Asia/Jakarta")
        await expect(duration).to_have_value("45")
        await expect(time_inputs.nth(0)).to_have_value("08:00")
        await expect(time_inputs.nth(1)).to_have_value("18:00")

        await page.get_by_role("button", name="Back to Dashboard", exact=True).click()
        await page.wait_for_url(re.compile(r".*/dashboard"), timeout=30000)
        await page.get_by_role("button", name="+ Add Event", exact=True).click()
        await expect(page.locator("#startTime")).to_have_value("09:00")
        await expect(page.locator("#endTime")).to_have_value("09:45")
        await page.get_by_role("button", name="Batal", exact=True).click(force=True)
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
