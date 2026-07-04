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


def test_soft_delete_and_restore():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    event_date = (date.today() + timedelta(days=380)).isoformat()
    title = f"Tier2 Soft Delete {uuid.uuid4().hex[:6]}"

    create = requests.post(
        f"{BASE_URL}/api/events",
        headers=headers,
        json={
            "title": title,
            "date": event_date,
            "start_time": "14:00:00",
            "duration_minutes": 60,
            "participants": "",
        },
        timeout=20,
    )
    assert create.status_code == 201, f"create failed: {create.status_code} {create.text[:300]}"
    event_id = create.json()["id"]

    delete = requests.delete(
        f"{BASE_URL}/api/events/{event_id}",
        headers=headers,
        timeout=20,
    )
    assert delete.status_code == 204, f"delete failed: {delete.status_code} {delete.text[:200]}"

    list_after = requests.get(f"{BASE_URL}/api/events", headers=headers, timeout=20)
    assert list_after.status_code == 200
    ids = [e["id"] for e in list_after.json()]
    assert event_id not in ids, "deleted event still visible in list"

    restore = requests.post(
        f"{BASE_URL}/api/events/{event_id}/restore",
        headers=headers,
        timeout=20,
    )
    assert restore.status_code == 200, f"restore failed: {restore.status_code} {restore.text[:300]}"
    assert restore.json()["id"] == event_id
    assert restore.json()["title"] == title

    list_restored = requests.get(f"{BASE_URL}/api/events", headers=headers, timeout=20)
    assert list_restored.status_code == 200
    ids2 = [e["id"] for e in list_restored.json()]
    assert event_id in ids2, "restored event not in list"
    cleanup = requests.delete(
        f"{BASE_URL}/api/events/{event_id}",
        headers=headers,
        timeout=20,
    )
    assert cleanup.status_code == 204, f"cleanup failed: {cleanup.status_code}"
    print("TIER2 SOFT DELETE RESTORE TEST PASSED")


test_soft_delete_and_restore()
