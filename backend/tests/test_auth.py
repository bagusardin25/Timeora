import time
import unittest
from unittest.mock import Mock, patch

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import _decode_token, verify_token
from app.config import settings


class TestJwtVerification(unittest.TestCase):
    issuer = "https://timeora-test.supabase.co/auth/v1"
    secret = "test-secret-that-is-not-used-in-production"

    def _token(self, **overrides):
        claims = {
            "aud": "authenticated",
            "email": "tester@example.com",
            "exp": int(time.time()) + 300,
            "iss": self.issuer,
            "sub": "00000000-0000-0000-0000-000000000001",
        }
        claims.update(overrides)
        return jwt.encode(claims, self.secret, algorithm="HS256")

    @staticmethod
    def _credentials(token):
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def _settings_patch(self):
        return patch.multiple(
            settings,
            SUPABASE_URL="https://timeora-test.supabase.co",
            SUPABASE_JWT_SECRET=self.secret,
        )

    def test_accepts_valid_signed_hs256_token(self):
        with self._settings_patch():
            payload = _decode_token(self._token())

        self.assertEqual(
            payload["sub"], "00000000-0000-0000-0000-000000000001"
        )

    def test_rejects_token_signed_with_wrong_key(self):
        token = jwt.encode(
            {
                "aud": "authenticated",
                "exp": int(time.time()) + 300,
                "iss": self.issuer,
                "sub": "00000000-0000-0000-0000-000000000001",
            },
            "attacker-controlled-key-at-least-32-bytes",
            algorithm="HS256",
        )

        with self._settings_patch(), self.assertRaises(HTTPException) as caught:
            verify_token(self._credentials(token))

        self.assertEqual(caught.exception.status_code, 401)

    def test_rejects_expired_token(self):
        with self._settings_patch(), self.assertRaises(HTTPException) as caught:
            verify_token(self._credentials(self._token(exp=int(time.time()) - 1)))

        self.assertEqual(caught.exception.status_code, 401)

    def test_rejects_wrong_audience(self):
        with self._settings_patch(), self.assertRaises(HTTPException) as caught:
            verify_token(self._credentials(self._token(aud="service_role")))

        self.assertEqual(caught.exception.status_code, 401)

    def test_rejects_wrong_issuer(self):
        with self._settings_patch(), self.assertRaises(HTTPException) as caught:
            verify_token(
                self._credentials(
                    self._token(iss="https://attacker.invalid/auth/v1")
                )
            )

        self.assertEqual(caught.exception.status_code, 401)

    def test_rejects_unsigned_token(self):
        token = jwt.encode(
            {
                "aud": "authenticated",
                "exp": int(time.time()) + 300,
                "iss": self.issuer,
                "sub": "00000000-0000-0000-0000-000000000001",
            },
            key="",
            algorithm="none",
        )

        with self._settings_patch(), self.assertRaises(HTTPException) as caught:
            verify_token(self._credentials(token))

        self.assertEqual(caught.exception.status_code, 401)

    @patch("app.auth._jwks_client")
    def test_uses_jwks_for_asymmetric_tokens(self, jwks_client):
        signing_key = Mock()
        signing_key.key = "public-key"
        jwks_client.return_value.get_signing_key_from_jwt.return_value = signing_key

        with (
            patch(
                "app.auth.jwt.get_unverified_header",
                return_value={"alg": "ES256"},
            ),
            patch("app.auth.jwt.decode", return_value={"sub": "verified"}) as decode,
            patch.object(
                settings,
                "SUPABASE_URL",
                "https://timeora-test.supabase.co",
            ),
        ):
            payload = _decode_token("header.payload.signature")

        self.assertEqual(payload["sub"], "verified")
        jwks_client.assert_called_once_with(
            "https://timeora-test.supabase.co/auth/v1/.well-known/jwks.json"
        )
        self.assertEqual(decode.call_args.kwargs["algorithms"], ["ES256"])
        self.assertEqual(decode.call_args.kwargs["issuer"], self.issuer)


if __name__ == "__main__":
    unittest.main()
