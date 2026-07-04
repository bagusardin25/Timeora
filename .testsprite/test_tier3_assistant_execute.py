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
    assert login.status_code == 200, f"login failed: {login.status_code}"
    token = login.json().get("access_token")
    assert token, "missing token"
    return token


def test_assistant_cancel_preview_then_execute():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    event_date = (date.today() + timedelta(days=395)).isoformat()
    title = f"Tier3 Cancel Target {uuid.uuid4().hex[:6]}"

    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": title,
            "date": event_date,
            "start_time": "10:00:00",
            "duration_minutes": 45,
            "participants": "",
        },
        timeout=20,
    )
    assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:300]}"
    event_id = create.json()["id"]

    preview = requests.post(
        f"{BASE_URL}/api/assistant",
        headers=headers,
        json={"text": f"cancel {title}"},
        timeout=20,
    )
    assert preview.status_code == 200, f"preview failed: {preview.status_code} {preview.text[:300]}"
    preview_data = preview.json()
    assert preview_data.get("intent") == "cancel", f"expected cancel intent, got {preview_data}"
    assert preview_data.get("requires_confirmation") is True, "preview should require confirmation"
    assert preview_data.get("executed") is False, "preview must not execute"
    result = preview_data.get("result") or {}
    assert result.get("primary_event_id") == event_id, "primary_event_id mismatch"
    assert result.get("primary_title") == title, "primary_title mismatch"

    execute = requests.post(
        f"{BASE_URL}/api/assistant",
        headers=headers,
        json={
            "confirm": True,
            "event_id": event_id,
            "action": "cancel",
        },
        timeout=20,
    )
    assert execute.status_code == 200, f"execute failed: {execute.status_code} {execute.text[:300]}"
    execute_data = execute.json()
    assert execute_data.get("executed") is True, "execute should set executed=true"
    assert execute_data.get("intent") == "cancel"

    listed = requests.get(f"{BASE_URL}/api/events", headers=headers, timeout=20)
    assert listed.status_code == 200
    ids = [e["id"] for e in listed.json()]
    assert event_id not in ids, "cancelled event still visible in list"
    print("TIER3 ASSISTANT CANCEL EXECUTE TEST PASSED")


test_assistant_cancel_preview_then_execute()
