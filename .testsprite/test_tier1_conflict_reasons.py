import uuid
from datetime import date, timedelta

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier1-conf-{uuid.uuid4().hex[:10]}@timeora.app"
    reg = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert reg.status_code in (200, 201)
    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=20,
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def test_conflict_alternatives_include_reason():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    event_date = (date.today() + timedelta(days=1)).isoformat()

    first = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": "Tier1 Blocker",
            "date": event_date,
            "start_time": "10:00:00",
            "duration_minutes": 60,
            "participants": "",
        },
        timeout=20,
    )
    assert first.status_code == 201, f"seed event failed: {first.status_code} {first.text[:200]}"

    conflict = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": "Tier1 Overlap",
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
    print("TIER1 CONFLICT REASONS TEST PASSED")


test_conflict_alternatives_include_reason()