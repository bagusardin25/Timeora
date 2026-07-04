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


def test_recurring_events_expand():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    anchor = date.today() + timedelta(days=365)
    first_monday = anchor + timedelta(days=(7 - anchor.weekday()) % 7)
    range_end = first_monday + timedelta(days=27)
    title = f"Tier2 Weekly Standup {uuid.uuid4().hex[:6]}"

    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": title,
            "date": first_monday.isoformat(),
            "start_time": "09:00:00",
            "duration_minutes": 30,
            "participants": "",
            "recurrence_rule": "weekly:monday",
        },
        timeout=20,
    )
    assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:300]}"
    event_id = create.json()["id"]

    try:
        expand = requests.get(
            f"{BASE_URL}/api/events",
            headers=headers,
            params={
                "expand": "true",
                "from": first_monday.isoformat(),
                "to": range_end.isoformat(),
            },
            timeout=20,
        )
        assert expand.status_code == 200, f"expand failed: {expand.status_code}"
        events = expand.json()
        mondays = [e for e in events if e["title"] == title]
        assert len(mondays) >= 3, f"expected >=3 Monday instances, got {len(mondays)}"
    finally:
        requests.delete(
            f"{BASE_URL}/api/events/{event_id}",
            headers=headers,
            timeout=20,
        )
    print(f"TIER2 RECURRING TEST PASSED ({len(mondays)} instances)")


test_recurring_events_expand()
