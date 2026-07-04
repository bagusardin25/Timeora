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


def test_conflict_alternatives_include_reason():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    event_date = (date.today() + timedelta(days=365)).isoformat()
    blocker_title = f"Tier1 Blocker {uuid.uuid4().hex[:6]}"

    first = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": blocker_title,
            "date": event_date,
            "start_time": "10:00:00",
            "duration_minutes": 60,
            "participants": "",
        },
        timeout=20,
    )
    assert first.status_code == 201, f"seed event failed: {first.status_code} {first.text[:200]}"
    event_id = first.json()["id"]

    try:
        conflict = requests.post(
            f"{BASE_URL}/api/events",
            headers=headers,
            json={
                "title": f"Tier1 Overlap {uuid.uuid4().hex[:6]}",
                "date": event_date,
                "start_time": "10:30:00",
                "duration_minutes": 45,
                "participants": "",
            },
            timeout=20,
        )
        assert conflict.status_code == 409, f"expected 409 conflict, got {conflict.status_code}"
        detail = conflict.json().get("detail", {})
        alts = detail.get("alternatives", [])
        assert alts, "expected alternatives in conflict response"
        assert alts[0].get("reason"), f"alternative missing reason: {alts[0]}"
    finally:
        requests.delete(
            f"{BASE_URL}/api/events/{event_id}",
            headers=headers,
            timeout=20,
        )
    print("TIER1 CONFLICT REASONS TEST PASSED")


test_conflict_alternatives_include_reason()
