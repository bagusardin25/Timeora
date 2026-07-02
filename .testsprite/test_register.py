import requests
import uuid

BASE_URL = "https://timeora-production.up.railway.app"


def test_register_endpoint():
    unique_email = f"register_{uuid.uuid4().hex[:12]}@timeora.app"
    resp = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": unique_email, "password": "TimeoraTest123!"},
        timeout=15,
    )
    assert resp.status_code in (200, 201), (
        f"Expected 200/201, got {resp.status_code}: {resp.text[:300]}"
    )
    data = resp.json()
    has_token = bool(data.get("access_token"))
    has_message = bool(data.get("message"))
    assert has_token or has_message, (
        f"Expected access_token or confirmation message, got: {data}"
    )
    if has_token:
        assert len(data["access_token"]) > 50, "Token too short"
    print("REGISTER TEST PASSED")


test_register_endpoint()