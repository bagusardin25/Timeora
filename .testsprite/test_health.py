import requests

BASE_URL = "https://timeora-production.up.railway.app"

def test_health():
    resp = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["status"] == "ok", f"Expected status=ok, got {data}"
    assert data["service"] == "timeora-api", f"Expected service=timeora-api"
    print("HEALTH TEST PASSED")
