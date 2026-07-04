import requests

BASE_URL = "https://timeora-production.up.railway.app"
EMAIL = "demo@timeora.app"
PASSWORD = "TimeoraDemo123!"


def test_register_endpoint_rejects_duplicate_account():
    resp = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert resp.status_code == 409, (
        f"Expected duplicate registration to return 409, got "
        f"{resp.status_code}: {resp.text[:300]}"
    )
    data = resp.json()
    assert data.get("detail"), f"Expected duplicate error detail, got: {data}"
    print("REGISTER DUPLICATE SAFETY TEST PASSED")


test_register_endpoint_rejects_duplicate_account()
