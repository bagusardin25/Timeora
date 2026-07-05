import io
import uuid
from datetime import date, timedelta

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


def test_integrations_status_webhook_and_ics_import():
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    suffix = uuid.uuid4().hex[:6]
    event_date = (date.today() + timedelta(days=420)).strftime("%Y%m%d")
    uid = f"integration-{suffix}@timeora.app"

    integrations = requests.get(
        f"{BASE_URL}/api/integrations",
        headers=headers,
        timeout=20,
    )
    assert integrations.status_code == 200, (
        f"integrations failed: {integrations.status_code} {integrations.text[:300]}"
    )
    providers = {item["provider"]: item for item in integrations.json()}
    assert providers["ics"]["status"] == "ready"
    assert providers["webhook"]["configured"] is True

    webhook = requests.post(
        f"{BASE_URL}/api/webhooks",
        headers=headers,
        json={
            "url": "https://8.8.8.8/webhook",
            "event_types": ["event.created"],
            "description": f"Integration test {suffix}",
        },
        timeout=20,
    )
    assert webhook.status_code == 201, (
        f"webhook create failed: {webhook.status_code} {webhook.text[:300]}"
    )
    webhook_body = webhook.json()
    subscription_id = webhook_body["id"]
    assert webhook_body.get("signing_secret"), "missing signing secret"

    ics_content = "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTART:{event_date}T100000",
            f"DTEND:{event_date}T110000",
            f"SUMMARY:Integration Import {suffix}",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    import_response = requests.post(
        f"{BASE_URL}/api/events/import-ics",
        headers=headers,
        files={"file": ("import.ics", io.BytesIO(ics_content.encode("utf-8")), "text/calendar")},
        timeout=20,
    )
    assert import_response.status_code == 200, (
        f"import failed: {import_response.status_code} {import_response.text[:300]}"
    )
    import_body = import_response.json()
    assert import_body["imported"] == 1, import_body
    imported_id = import_body["events"][0]["id"]

    duplicate = requests.post(
        f"{BASE_URL}/api/events/import-ics",
        headers=headers,
        files={"file": ("import.ics", io.BytesIO(ics_content.encode("utf-8")), "text/calendar")},
        timeout=20,
    )
    assert duplicate.status_code == 200, duplicate.text[:300]
    assert duplicate.json()["imported"] == 0
    assert duplicate.json()["skipped"] >= 1

    cleanup_event = requests.delete(
        f"{BASE_URL}/api/events/{imported_id}",
        headers=headers,
        timeout=20,
    )
    assert cleanup_event.status_code == 204, cleanup_event.text[:200]

    cleanup_webhook = requests.delete(
        f"{BASE_URL}/api/webhooks/{subscription_id}",
        headers=headers,
        timeout=20,
    )
    assert cleanup_webhook.status_code == 204, cleanup_webhook.text[:200]

    print("INTEGRATIONS WEBHOOK ICS IMPORT TEST PASSED")


test_integrations_status_webhook_and_ics_import()