import requests

BASE_URL = "https://timeora-production.up.railway.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"


def test_reusable_account_login():
    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    assert login_resp.status_code == 200, (
        f"Login failed: {login_resp.status_code} {login_resp.text[:300]}"
    )
    token = login_resp.json().get("access_token")
    assert token and len(token) > 50, "Missing valid access token after login"

    print("E2E AUTH ONLY TEST PASSED")


test_reusable_account_login()
