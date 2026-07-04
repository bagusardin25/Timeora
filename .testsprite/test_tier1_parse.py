import uuid

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraE2E123!"


def _token():
    email = f"tier1-parse-{uuid.uuid4().hex[:10]}@timeora.app"
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


def test_parse_hybrid_response_shape():
    token = _token()
    resp = requests.post(
        f"{BASE_URL}/api/parse",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Jadwalkan meeting tim marketing besok jam 10 selama 45 menit"},
        timeout=30,
    )
    assert resp.status_code == 200, f"parse failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    assert data.get("source") in ("ai", "fallback"), f"unexpected source: {data}"
    assert data.get("title"), "missing title"
    assert data.get("date"), "missing date"
    assert data.get("start_time"), "missing start_time"
    assert int(data.get("duration_minutes", 0)) >= 5, "invalid duration"
    print(f"TIER1 PARSE TEST PASSED (source={data.get('source')})")


test_parse_hybrid_response_shape()