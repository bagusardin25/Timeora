import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.routers import events


class TestEventsRouter(unittest.IsolatedAsyncioTestCase):
    async def test_list_events_rejects_invalid_from_date(self):
        with patch.object(events.data_access, "list_events", AsyncMock(return_value=[])):
            with self.assertRaises(HTTPException) as raised:
                await events.list_events(
                    from_date="not-a-date",
                    to_date=None,
                    q=None,
                    expand=False,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("from", raised.exception.detail)

    async def test_list_events_rejects_invalid_to_date(self):
        with patch.object(events.data_access, "list_events", AsyncMock(return_value=[])):
            with self.assertRaises(HTTPException) as raised:
                await events.list_events(
                    from_date=None,
                    to_date="2026-99-99",
                    q=None,
                    expand=False,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("to", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
