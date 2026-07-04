import uuid

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier2-analytics-{uuid.uuid4().hex[:10]}@timeora.app"
    reg = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert reg.status_code in (200, 201), f"register failed: {reg.status_code} {reg.text[:200]}"
    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert login.status_code == 200, f"login failed: {login.status_code}"
    token = login.json().get("access_token")
    assert token, "missing token"
    return token


def test_weekly_analytics_endpoint():
    token = _token()
    resp = requests.get(
        f"{BASE_URL}/api/analytics/week",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert resp.status_code == 200, f"analytics failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    assert "hours_per_day" in data, "missing hours_per_day"
    assert "total_hours" in data, "missing total_hours"
    assert "deep_work_blocks" in data, "missing deep_work_blocks"
    assert "fragmentation_score" in data, "missing fragmentation_score"
    assert data.get("suggestion"), "missing suggestion"
    for day in ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"):
        assert day in data["hours_per_day"], f"missing day {day}"
    print(f"TIER2 ANALYTICS TEST PASSED (total_hours={data['total_hours']})")


test_weekly_analytics_endpoint()