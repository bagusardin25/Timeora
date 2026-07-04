import uuid

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier1-asst-{uuid.uuid4().hex[:10]}@timeora.app"
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


def test_assistant_query_intent():
    token = _token()
    resp = requests.post(
        f"{BASE_URL}/api/assistant",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "apa jadwal saya hari jumat"},
        timeout=20,
    )
    assert resp.status_code == 200, f"assistant failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    assert data.get("intent") == "query", f"expected query intent, got {data}"
    assert "message" in data, "missing message"
    assert isinstance(data.get("result"), list), "query result should be a list"
    print("TIER1 ASSISTANT QUERY TEST PASSED")


test_assistant_query_intent()