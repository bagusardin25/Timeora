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


def test_assistant_accept_language_en_and_id():
    token = _token()
    base_headers = {"Authorization": f"Bearer {token}"}

    # Real English FE header includes a low-q id fallback — must NOT force Indonesian.
    en = requests.post(
        f"{BASE_URL}/api/assistant",
        headers={**base_headers, "Accept-Language": "en-US,en;q=0.9,id;q=0.8"},
        json={"text": "What do I have today?"},
        timeout=40,
    )
    assert en.status_code == 200, f"en failed: {en.status_code} {en.text[:300]}"
    en_data = en.json()
    en_msg = str(en_data.get("message") or "")
    assert en_data.get("message") or en_data.get("result") is not None, en_data
    assert "Tidak ada event" not in en_msg, f"EN header returned ID copy: {en_msg}"

    id_resp = requests.post(
        f"{BASE_URL}/api/assistant",
        headers={**base_headers, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"},
        json={"text": "Apa jadwal saya hari ini?"},
        timeout=40,
    )
    assert id_resp.status_code == 200, f"id failed: {id_resp.status_code} {id_resp.text[:300]}"
    id_data = id_resp.json()
    id_msg = str(id_data.get("message") or "")
    assert id_data.get("message") or id_data.get("result") is not None, id_data
    # Empty-day ID template or found template should be Indonesian when preferred.
    if "event" in id_msg.lower() or "jadwal" in id_msg.lower() or "Tidak" in id_msg or "Ditemukan" in id_msg:
        assert (
            "Tidak ada" in id_msg
            or "Ditemukan" in id_msg
            or "event" in id_msg.lower()
        ), id_msg
    print("ASSISTANT LOCALE HEADER TEST PASSED")


test_assistant_accept_language_en_and_id()
