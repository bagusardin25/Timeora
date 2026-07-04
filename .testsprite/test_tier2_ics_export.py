import uuid

import requests

BASE_URL = "https://timeora-production.up.railway.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"


def _token():
    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def test_ics_export():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    title = f"Tier2 ICS Export {uuid.uuid4().hex[:6]}"

    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": title,
            "date": "2031-08-15",
            "start_time": "10:00:00",
            "duration_minutes": 60,
            "participants": "team",
        },
        timeout=20,
    )
    assert create.status_code == 201
    event_id = create.json()["id"]

    try:
        resp = requests.get(f"{BASE_URL}/api/export/ics", headers=headers, timeout=20)
        assert resp.status_code == 200, f"export failed: {resp.status_code} {resp.text[:200]}"
        assert "text/calendar" in resp.headers.get("Content-Type", "")
        body = resp.text
        assert "BEGIN:VCALENDAR" in body
        assert "BEGIN:VEVENT" in body
        assert title in body
    finally:
        requests.delete(
            f"{BASE_URL}/api/events/{event_id}",
            headers=headers,
            timeout=20,
        )
    print("TIER2 ICS EXPORT TEST PASSED")


test_ics_export()
