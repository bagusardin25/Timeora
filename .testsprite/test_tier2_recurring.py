import uuid
from datetime import date, timedelta

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier2-recur-{uuid.uuid4().hex[:10]}@timeora.app"
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
    return login.json()["access_token"]


def test_recurring_events_expand():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}

    # First Monday in range: 2026-07-06
    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": "Tier2 Weekly Standup",
            "date": "2026-07-06",
            "start_time": "09:00:00",
            "duration_minutes": 30,
            "participants": "",
            "recurrence_rule": "weekly:monday",
        },
        timeout=20,
    )
    assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:300]}"

    expand = requests.get(
        f"{BASE_URL}/api/events",
        headers=headers,
        params={"expand": "true", "from": "2026-07-01", "to": "2026-07-31"},
        timeout=20,
    )
    assert expand.status_code == 200, f"expand failed: {expand.status_code}"
    events = expand.json()
    mondays = [e for e in events if e["title"] == "Tier2 Weekly Standup"]
    assert len(mondays) >= 3, f"expected >=3 Monday instances, got {len(mondays)}"
    print(f"TIER2 RECURRING TEST PASSED ({len(mondays)} instances)")


test_recurring_events_expand()