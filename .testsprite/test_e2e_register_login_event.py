import uuid
from datetime import date, timedelta

import requests

BASE_URL = "https://timeora-production.up.railway.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"


def test_login_create_and_cleanup_event():
    health_resp = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert health_resp.status_code == 200, f"Health check failed: {health_resp.text}"
    health = health_resp.json()
    assert health.get("db") == "connected", (
        f"Database not connected on server: {health}"
    )
    assert health.get("db_mode") in ("postgres", "supabase_rest"), (
        f"Unexpected db mode: {health}"
    )

    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=45,
    )
    assert login_resp.status_code == 200, (
        f"Login failed: {login_resp.status_code} {login_resp.text[:300]}"
    )
    login_data = login_resp.json()
    token = login_data.get("access_token")
    assert token and len(token) > 50, "Missing valid access token after login"

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    event_title = f"E2E Meeting {uuid.uuid4().hex[:6]}"

    create_resp = requests.post(
        f"{BASE_URL}/api/events",
        json={
            "title": event_title,
            "date": tomorrow,
            "start_time": "14:00:00",
            "duration_minutes": 60,
            "participants": "",
        },
        headers=headers,
        timeout=45,
    )
    assert create_resp.status_code in (200, 201), (
        f"Create event failed: {create_resp.status_code} {create_resp.text[:300]}"
    )
    created = create_resp.json()
    assert created.get("title") == event_title
    event_id = created["id"]

    try:
        list_resp = requests.get(f"{BASE_URL}/api/events", headers=headers, timeout=20)
        assert list_resp.status_code == 200, (
            f"List events failed: {list_resp.status_code} {list_resp.text[:300]}"
        )
        events = list_resp.json()
        assert any(e.get("title") == event_title for e in events), (
            f"Created event not found in list: {events}"
        )
    finally:
        requests.delete(
            f"{BASE_URL}/api/events/{event_id}",
            headers=headers,
            timeout=20,
        )

    print("E2E REGISTER LOGIN EVENT TEST PASSED")


test_login_create_and_cleanup_event()
