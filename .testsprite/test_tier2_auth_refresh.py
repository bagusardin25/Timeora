import uuid

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def test_auth_refresh():
    email = f"tier2-refresh-{uuid.uuid4().hex[:10]}@timeora.app"
    reg = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert reg.status_code in (200, 201), f"register failed: {reg.status_code}"

    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert login.status_code == 200
    login_data = login.json()
    refresh_token = login_data.get("refresh_token")
    assert refresh_token, "login response missing refresh_token"

    refresh = requests.post(
        f"{BASE_URL}/api/auth/refresh",
        json={"refresh_token": refresh_token},
        timeout=20,
    )
    assert refresh.status_code == 200, f"refresh failed: {refresh.status_code} {refresh.text[:200]}"
    data = refresh.json()
    assert data.get("access_token"), "refresh response missing access_token"
    assert data.get("token_type") == "bearer"
    print("TIER2 AUTH REFRESH TEST PASSED")


test_auth_refresh()