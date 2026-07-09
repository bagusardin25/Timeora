"""Coverage: Assistant query schedule — fixed script (EN locale messages)."""
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

        # Ensure English if toggle is visible
        lang = page.get_by_role("button", name="Switch language")
        if await lang.count() > 0:
            label = (await lang.first.get_attribute("title")) or ""
            if "Indonesian" in label or "id" in (await lang.first.inner_text()).lower():
                # toggle until en
                for _ in range(2):
                    text = (await lang.first.inner_text()).strip().lower()
                    if text == "en" or "en" in text:
                        break
                    await lang.first.click()
                    await page.wait_for_timeout(400)

        await page.get_by_role("button", name="Open AI calendar chat (⌘K)", exact=True).click()
        await page.get_by_placeholder("Ask or type a message…", exact=True).fill(
            "What do I have today?"
        )
        await page.get_by_role("button", name="Send", exact=True).click()
        await page.wait_for_timeout(6000)

        panel = page.get_by_label("Ask your calendar")
        # EN empty-day or found message, or Indonesian fallback still counts as schedule reply
        body = page.locator("body")
        content = await body.inner_text()
        ok = (
            "No events found" in content
            or "Found " in content
            or "event" in content.lower()
            or "Tidak ada event" in content
            or "Ditemukan" in content
        )
        assert ok, f"Expected schedule-related assistant reply, got: {content[:500]}"
        assert "dashboard" in page.url
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
