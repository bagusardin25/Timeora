import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.config import settings
from app.core.ics_import import parse_ics
from app.integrations.crypto import (
    decrypt_token,
    encrypt_token,
    webhook_secret,
    webhook_signature,
)
from app.integrations.email import participant_emails
from app.integrations.webhooks import validate_webhook_target


class TestIcsImport(unittest.TestCase):
    def test_parses_event_attendees_recurrence_and_uid(self):
        content = "\r\n".join(
            [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "BEGIN:VEVENT",
                "UID:external-123",
                "DTSTART:20260706T090000",
                "DTEND:20260706T100000",
                "SUMMARY:Weekly planning",
                "RRULE:FREQ=WEEKLY;BYDAY=MO",
                "ATTENDEE:mailto:one@example.com",
                "ATTENDEE;CN=Two:MAILTO:two@example.com",
                "END:VEVENT",
                "END:VCALENDAR",
            ]
        )

        events, errors = parse_ics(content, default_timezone="UTC")

        self.assertEqual(errors, [])
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event.title, "Weekly planning")
        self.assertEqual(event.duration_minutes, 60)
        self.assertEqual(event.recurrence_rule, "weekly:monday")
        self.assertEqual(
            event.participants, "one@example.com, two@example.com"
        )
        self.assertEqual(event.external_ids, {"ics": "external-123"})

    def test_unfolds_lines_and_uses_duration(self):
        content = "\n".join(
            [
                "BEGIN:VCALENDAR",
                "BEGIN:VEVENT",
                "DTSTART;VALUE=DATE:20260707",
                "DURATION:PT45M",
                "SUMMARY:Long",
                " title",
                "END:VEVENT",
                "END:VCALENDAR",
            ]
        )

        events, errors = parse_ics(content, default_timezone="UTC")

        self.assertEqual(errors, [])
        self.assertEqual(events[0].title, "Longtitle")
        self.assertEqual(events[0].start_time.hour, 9)
        self.assertEqual(events[0].duration_minutes, 45)

    def test_rejects_non_calendar_content(self):
        with self.assertRaisesRegex(ValueError, "valid iCalendar"):
            parse_ics("not a calendar")


class TestIntegrationSecurity(unittest.IsolatedAsyncioTestCase):
    def test_encrypts_and_decrypts_tokens(self):
        with patch.object(settings, "INTEGRATION_ENCRYPTION_KEY", "test-key"):
            encrypted = encrypt_token("provider-secret")

            self.assertIsNotNone(encrypted)
            self.assertNotIn("provider-secret", encrypted)
            self.assertEqual(decrypt_token(encrypted), "provider-secret")

    def test_webhook_signatures_are_stable_and_payload_bound(self):
        with patch.object(settings, "INTEGRATION_SIGNING_KEY", "signing-key"):
            secret = webhook_secret("subscription-1")
            signature = webhook_signature("subscription-1", b'{"value":1}')

            self.assertEqual(secret, webhook_secret("subscription-1"))
            self.assertEqual(
                signature,
                webhook_signature("subscription-1", b'{"value":1}'),
            )
            self.assertNotEqual(
                signature,
                webhook_signature("subscription-1", b'{"value":2}'),
            )

    async def test_webhook_target_rejects_private_addresses(self):
        with patch.object(settings, "INTEGRATION_ALLOW_HTTP_WEBHOOKS", False):
            with self.assertRaises(HTTPException) as raised:
                await validate_webhook_target("https://127.0.0.1/webhook")

        self.assertEqual(raised.exception.status_code, 422)

    async def test_webhook_target_accepts_public_https_address(self):
        with patch.object(settings, "INTEGRATION_ALLOW_HTTP_WEBHOOKS", False):
            await validate_webhook_target("https://8.8.8.8/webhook")


class TestEmailRecipients(unittest.TestCase):
    def test_normalizes_deduplicates_and_filters_participants(self):
        result = participant_emails(
            "One@Example.com; invalid, one@example.com two@example.org"
        )

        self.assertEqual(result, ["one@example.com", "two@example.org"])
