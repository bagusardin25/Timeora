import requests

BASE_URL = "https://timeora-production.up.railway.app"

def test_login():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "demo@timeora.app", "password": "TimeoraDemo123!"},
        timeout=10,
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "access_token" in data, f"Missing access_token in response: {data}"
    assert data["token_type"] == "bearer"
    assert len(data["access_token"]) > 50, "Token too short"
    print("LOGIN TEST PASSED")
