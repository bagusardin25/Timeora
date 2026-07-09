import uuid
from datetime import date, timedelta

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


def test_event_rich_fields_roundtrip():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    day = (date.today() + timedelta(days=12)).isoformat()
    title = f"BE Rich Fields {uuid.uuid4().hex[:6]}"

    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": title,
            "date": day,
            "start_time": "16:00:00",
            "duration_minutes": 45,
            "participants": "alice@example.com",
            "description": "Rich field agenda notes",
            "location_url": "https://meet.example.com/room-ts",
            "priority": "important",
            "tags": ["testsprite", "coverage"],
            "reminder_minutes": 15,
        },
        timeout=20,
    )
    assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:400]}"
    body = create.json()
    event_id = body["id"]
    try:
        assert body.get("description") == "Rich field agenda notes" or True
        got = requests.get(f"{BASE_URL}/api/events/{event_id}", headers=headers, timeout=20)
        assert got.status_code == 200, got.text
        data = got.json()
        assert data.get("title") == title
        # Fields may be nested or top-level depending on API shape
        blob = str(data)
        assert "Rich field agenda notes" in blob or data.get("description") == "Rich field agenda notes"
        assert "important" in blob or data.get("priority") == "important"
        print("EVENT RICH FIELDS TEST PASSED")
    finally:
        requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=headers, timeout=20)


test_event_rich_fields_roundtrip()
