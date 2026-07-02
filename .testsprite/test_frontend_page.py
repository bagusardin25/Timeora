import requests

FRONTEND_URL = "https://timeora-alpha.vercel.app"

def test_frontend_login_page_renders():
    resp = requests.get(f"{FRONTEND_URL}/login", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    html = resp.text
    # Check if our specific elements render
    assert "Timeora" in html, "Missing Title Timeora"
    assert "Sign in to your intelligent time companion" in html, "Missing description"
    assert "Email" in html, "Missing Email label"
    assert "Password" in html, "Missing Password label"
    print("FRONTEND LOGIN TEST PASSED")
