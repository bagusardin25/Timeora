import uuid
from datetime import date, timedelta

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier3-insights-{uuid.uuid4().hex[:10]}@timeora.app"
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


def _weekday_dates():
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return {
        "monday": monday,
        "tuesday": monday + timedelta(days=1),
        "thursday": monday + timedelta(days=3),
    }


def test_actionable_insights_block_focus_and_spread_load():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    days = _weekday_dates()

    for title, event_date, start_time, duration in [
        ("Tier3 Heavy A", days["thursday"].isoformat(), "09:00:00", 120),
        ("Tier3 Heavy B", days["thursday"].isoformat(), "14:00:00", 120),
        ("Tier3 Light Event", days["tuesday"].isoformat(), "11:00:00", 60),
    ]:
        create = requests.post(
            f"{BASE_URL}/api/events",
            headers=headers,
            json={
                "title": title,
                "date": event_date,
                "start_time": start_time,
                "duration_minutes": duration,
                "participants": "",
            },
            timeout=20,
        )
        assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:300]}"

    week = requests.get(
        f"{BASE_URL}/api/analytics/week",
        headers=headers,
        timeout=20,
    )
    assert week.status_code == 200, f"week failed: {week.status_code} {week.text[:300]}"
    data = week.json()
    actions = data.get("actions") or []
    assert isinstance(actions, list), "actions should be a list"
    action_types = {a.get("type") for a in actions}
    assert "block_focus_time" in action_types, f"expected block_focus_time action, got {actions}"
    assert "spread_load" in action_types, f"expected spread_load action, got {actions}"

    block = requests.post(
        f"{BASE_URL}/api/analytics/actions/block-focus",
        headers=headers,
        timeout=20,
    )
    assert block.status_code == 200, f"block-focus failed: {block.status_code} {block.text[:300]}"
    block_data = block.json()
    assert block_data.get("action_type") == "block_focus_time"
    assert block_data.get("event", {}).get("title") == "Focus Block"

    spread = requests.post(
        f"{BASE_URL}/api/analytics/actions/spread-load",
        headers=headers,
        timeout=20,
    )
    assert spread.status_code == 200, f"spread-load failed: {spread.status_code} {spread.text[:300]}"
    spread_data = spread.json()
    assert spread_data.get("action_type") == "spread_load"
    moved = spread_data.get("event") or {}
    assert moved.get("title") in ("Tier3 Heavy A", "Tier3 Heavy B", "Tier3 Light Event")
    print("TIER3 ACTIONABLE INSIGHTS TEST PASSED")


test_actionable_insights_block_focus_and_spread_load()