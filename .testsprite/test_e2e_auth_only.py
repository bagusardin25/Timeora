import uuid

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def test_register_and_login():
    email = f"e2e_{uuid.uuid4().hex[:12]}@timeora.app"

    register_resp = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert register_resp.status_code in (200, 201), (
        f"Register failed: {register_resp.status_code} {register_resp.text[:300]}"
    )

    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert login_resp.status_code == 200, (
        f"Login failed: {login_resp.status_code} {login_resp.text[:300]}"
    )
    token = login_resp.json().get("access_token")
    assert token and len(token) > 50, "Missing valid access token after login"

    print("E2E AUTH ONLY TEST PASSED")


test_register_and_login()