import unittest

from fastapi import HTTPException

from app.routers import analytics


class TestAnalyticsRouter(unittest.TestCase):
    def test_reference_date_rejects_invalid_date(self):
        with self.assertRaises(HTTPException) as raised:
            analytics._reference_date("2026-99-99")

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("date", raised.exception.detail)
        self.assertIn("YYYY-MM-DD", raised.exception.detail)

    def test_reference_date_accepts_valid_date(self):
        self.assertEqual(
            analytics._reference_date("2026-07-07").isoformat(),
            "2026-07-07",
        )


if __name__ == "__main__":
    unittest.main()
