import uuid
from datetime import date, timedelta

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier3-heatmap-{uuid.uuid4().hex[:10]}@timeora.app"
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


def test_availability_heatmap_reflects_busy_slot():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    wednesday = monday + timedelta(days=2)

    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": "Tier3 Heatmap Busy",
            "date": wednesday.isoformat(),
            "start_time": "10:00:00",
            "duration_minutes": 60,
            "participants": "",
        },
        timeout=20,
    )
    assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:300]}"

    resp = requests.get(
        f"{BASE_URL}/api/analytics/availability",
        headers=headers,
        timeout=20,
    )
    assert resp.status_code == 200, f"availability failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()

    assert "days" in data and len(data["days"]) == 7
    assert "hours" in data and len(data["hours"]) >= 8
    assert "cells" in data and len(data["cells"]) == len(data["days"]) * len(data["hours"])
    assert "availability_pct" in data
    assert data["availability_pct"] < 100, "expected some busy cells after creating an event"

    busy_cells = [c for c in data["cells"] if c["day"] == "Wed" and c["hour"] == 10]
    assert busy_cells, "missing Wednesday 10:00 cell"
    assert busy_cells[0]["score"] < 0.5, f"expected busy score, got {busy_cells[0]['score']}"

    free_cells = [c for c in data["cells"] if c["score"] >= 0.99]
    assert free_cells, "expected at least one fully free cell"
    print("TIER3 AVAILABILITY HEATMAP TEST PASSED")


test_availability_heatmap_reflects_busy_slot()