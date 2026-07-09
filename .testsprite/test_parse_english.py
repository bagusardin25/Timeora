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


def test_parse_english_hybrid():
    token = _token()
    resp = requests.post(
        f"{BASE_URL}/api/parse",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Schedule design review tomorrow at 2pm for 45 minutes"},
        timeout=40,
    )
    assert resp.status_code == 200, f"parse failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    assert data.get("source") in ("ai", "fallback"), data
    assert data.get("title"), data
    assert data.get("date"), data
    assert data.get("start_time"), data
    duration = int(data.get("duration_minutes") or 0)
    assert duration >= 5, data
    print(f"ENGLISH PARSE TEST PASSED (source={data.get('source')}, time={data.get('start_time')})")


test_parse_english_hybrid()
