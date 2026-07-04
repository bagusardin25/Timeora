import base64
import hashlib
import hmac
import json
import time

import requests

BASE_URL = "https://timeora-production.up.railway.app"
PASSWORD = "TimeoraDemo123!"


def _encode_json(value):
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _forged_token():
    header = _encode_json({"alg": "HS256", "typ": "JWT"})
    payload = _encode_json(
        {
            "aud": "authenticated",
            "email": "attacker@example.invalid",
            "exp": int(time.time()) + 300,
            "iss": "https://attacker.invalid/auth/v1",
            "sub": "00000000-0000-0000-0000-000000000001",
        }
    )
    signature = base64.urlsafe_b64encode(
        hmac.new(
            b"attacker-controlled-key-at-least-32-bytes",
            f"{header}.{payload}".encode(),
            hashlib.sha256,
        ).digest()
    ).rstrip(b"=").decode()
    return f"{header}.{payload}.{signature}"


def test_final_backend_security_smoke():
    health = requests.get(f"{BASE_URL}/api/health", timeout=20)
    assert health.status_code == 200, health.text
    health_data = health.json()
    assert health_data.get("status") == "ok", health_data
    assert health_data.get("db") == "connected", health_data
    assert health_data.get("auth") == "jwt-signature-verified", health_data

    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "demo@timeora.app", "password": PASSWORD},
        timeout=30,
    )
    assert login.status_code == 200, login.text
    token = login.json().get("access_token")
    assert token, "Login did not return an access token"

    signed_headers = {"Authorization": f"Bearer {token}"}
    events = requests.get(
        f"{BASE_URL}/api/events",
        headers=signed_headers,
        timeout=20,
    )
    assert events.status_code == 200, events.text

    forged = requests.get(
        f"{BASE_URL}/api/events",
        headers={"Authorization": f"Bearer {_forged_token()}"},
        timeout=20,
    )
    assert forged.status_code == 401, (
        f"Forged JWT must be rejected, got {forged.status_code}: {forged.text}"
    )

    parsed = requests.post(
        f"{BASE_URL}/api/parse",
        headers=signed_headers,
        json={
            "text": "Jadwalkan meeting tim marketing besok jam 2 siang selama 45 menit"
        },
        timeout=40,
    )
    assert parsed.status_code == 200, parsed.text
    parsed_data = parsed.json()
    assert parsed_data.get("source") in ("ai", "fallback"), parsed_data
    assert parsed_data.get("start_time", "").startswith("14:00"), parsed_data
    assert parsed_data.get("duration_minutes") == 45, parsed_data

    availability = requests.get(
        f"{BASE_URL}/api/analytics/availability",
        headers=signed_headers,
        timeout=20,
    )
    assert availability.status_code == 200, availability.text
    availability_data = availability.json()
    assert len(availability_data.get("days", [])) == 7, availability_data
    assert availability_data.get("cells"), availability_data

    print("FINAL BACKEND SECURITY SMOKE PASSED")


test_final_backend_security_smoke()
