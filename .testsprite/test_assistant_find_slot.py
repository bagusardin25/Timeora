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


def test_assistant_find_slot_intent():
    token = _token()
    resp = requests.post(
        f"{BASE_URL}/api/assistant",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Find a free 1 hour slot tomorrow afternoon"},
        timeout=40,
    )
    assert resp.status_code == 200, f"assistant failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    intent = data.get("intent")
    assert intent in ("find_slot", "query", "create"), f"unexpected intent: {data}"
    assert data.get("message") or data.get("result"), f"empty response: {data}"
    result = data.get("result")
    # Prefer structured free slots when intent is find_slot
    if intent == "find_slot":
        assert result is not None, "find_slot missing result"
    print(f"ASSISTANT FIND SLOT TEST PASSED (intent={intent})")


test_assistant_find_slot_intent()
