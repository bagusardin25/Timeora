import unittest
from datetime import date, time
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi import HTTPException

from app import data_access, supabase_store
from app.database import init_pool
from app.models import AuthResponse, EventCreate, EventResponse, LoginRequest, RefreshRequest
from app.routers import auth, export


class TestSupabaseRestMode(unittest.IsolatedAsyncioTestCase):
    async def test_upsert_user_uses_supabase_rest_without_pool_retry(self):
        with (
            patch.object(data_access.supabase_store, "is_configured", return_value=True),
            patch.object(data_access.supabase_store, "upsert_user", AsyncMock()) as upsert_user,
            patch.object(
                data_access,
                "ensure_pool",
                AsyncMock(side_effect=AssertionError("pool should not be used")),
            ) as ensure_pool,
        ):
            await data_access.upsert_user("user-1", "demo@timeora.app")

        upsert_user.assert_awaited_once_with("user-1", "demo@timeora.app")
        ensure_pool.assert_not_awaited()

    async def test_create_event_uses_supabase_rest_without_pool_retry(self):
        created = EventResponse(
            id="event-1",
            user_id="user-1",
            title="Report regression",
            date=date(2026, 8, 15),
            start_time=time(10, 0),
            duration_minutes=60,
            participants="",
        )
        body = EventCreate(
            title="Report regression",
            date=date(2026, 8, 15),
            start_time=time(10, 0),
            duration_minutes=60,
        )

        with (
            patch.object(data_access.supabase_store, "is_configured", return_value=True),
            patch.object(
                data_access.supabase_store,
                "create_event",
                AsyncMock(return_value=created),
            ) as create_event,
            patch.object(
                data_access,
                "ensure_pool",
                AsyncMock(side_effect=AssertionError("pool should not be used")),
            ) as ensure_pool,
        ):
            result = await data_access.create_event("user-1", body)

        self.assertEqual(result.id, "event-1")
        create_event.assert_awaited_once_with("user-1", body)
        ensure_pool.assert_not_awaited()

    async def test_init_pool_skips_direct_db_when_supabase_rest_is_configured(self):
        with (
            patch.object(auth.settings, "SUPABASE_URL", "https://timeora-test.supabase.co"),
            patch.object(auth.settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key"),
            patch(
                "app.database.candidate_database_dsns",
                Mock(side_effect=AssertionError("dsn discovery should not run")),
            ),
        ):
            await init_pool()


class _TimeoutClient:
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, *args, **kwargs):
        raise httpx.TimeoutException("slow upstream")


class _JsonResponse:
    def __init__(self, status_code, body, text=""):
        self.status_code = status_code
        self._body = body
        self.text = text

    def json(self):
        return self._body


class _TimeoutThenOkGetClient:
    calls = 0

    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        type(self).calls += 1
        if type(self).calls == 1:
            raise httpx.TimeoutException("slow upstream")
        return _JsonResponse(200, [{"ok": True}])


class _GatewayThenOkGetClient:
    calls = 0

    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        type(self).calls += 1
        if type(self).calls == 1:
            return _JsonResponse(504, {"message": "slow upstream"})
        return _JsonResponse(200, [{"ok": True}])


class _AlwaysTimeoutPostClient:
    calls = 0

    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, *args, **kwargs):
        type(self).calls += 1
        raise httpx.TimeoutException("slow upstream")


class _CapturingOkGetClient:
    init_kwargs = {}

    def __init__(self, *args, **kwargs):
        type(self).init_kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        return _JsonResponse(200, [{"ok": True}])


class _CapturingOkPostClient:
    init_kwargs = {}

    def __init__(self, *args, **kwargs):
        type(self).init_kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, *args, **kwargs):
        return _JsonResponse(200, {"ok": True})


def _event_row(event_id: str, title: str = "Report regression") -> dict:
    return {
        "id": event_id,
        "user_id": "user-1",
        "title": title,
        "date": "2026-08-15",
        "start_time": "10:00:00",
        "duration_minutes": 60,
        "participants": "",
    }


class TestAuthReportRegressions(unittest.IsolatedAsyncioTestCase):
    def test_register_response_model_preserves_refresh_token(self):
        response = AuthResponse(
            access_token="access-token",
            refresh_token="refresh-token",
        )

        self.assertEqual(response.refresh_token, "refresh-token")

    def test_supabase_auth_headers_include_service_role_bearer(self):
        with patch.object(auth.settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key"):
            headers = auth._supabase_headers()

        self.assertEqual(headers["apikey"], "service-key")
        self.assertEqual(headers["Authorization"], "Bearer service-key")

    async def test_refresh_timeout_returns_gateway_timeout(self):
        with patch.object(auth.httpx, "AsyncClient", _TimeoutClient):
            with self.assertRaises(HTTPException) as raised:
                await auth.refresh_session(RefreshRequest(refresh_token="refresh-token"))

        self.assertEqual(raised.exception.status_code, 504)
        self.assertEqual(raised.exception.detail, "Authentication provider timed out")

    async def test_login_returns_tokens_when_user_mirror_upsert_times_out(self):
        login_payload = {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "user": {"id": "user-1", "email": "demo@timeora.app"},
        }

        with (
            patch.object(
                auth,
                "_post_supabase",
                AsyncMock(return_value=_JsonResponse(200, login_payload)),
            ),
            patch.object(
                auth.data_access,
                "upsert_user",
                AsyncMock(
                    side_effect=HTTPException(
                        status_code=504,
                        detail="Database request timed out",
                    )
                ),
            ),
        ):
            response = await auth.login(
                LoginRequest(email="demo@timeora.app", password="password")
            )

        self.assertEqual(response.access_token, "access-token")
        self.assertEqual(response.refresh_token, "refresh-token")

    async def test_auth_provider_request_does_not_use_environment_proxy(self):
        _CapturingOkPostClient.init_kwargs = {}

        with patch.object(auth.httpx, "AsyncClient", _CapturingOkPostClient):
            response = await auth._post_supabase(
                "https://example.test/auth/v1/token",
                {"refresh_token": "refresh-token"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertIs(_CapturingOkPostClient.init_kwargs["trust_env"], False)


class TestSupabaseStoreReportRegressions(unittest.IsolatedAsyncioTestCase):
    async def test_supabase_read_timeout_retries_once_before_success(self):
        _TimeoutThenOkGetClient.calls = 0

        with (
            patch.object(supabase_store.httpx, "AsyncClient", _TimeoutThenOkGetClient),
            patch.object(supabase_store.asyncio, "sleep", AsyncMock()) as sleep,
        ):
            response = await supabase_store._request("get", "https://example.test/rest/v1/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(_TimeoutThenOkGetClient.calls, 2)
        sleep.assert_awaited_once()

    async def test_supabase_read_gateway_status_retries_once_before_success(self):
        _GatewayThenOkGetClient.calls = 0

        with (
            patch.object(supabase_store.httpx, "AsyncClient", _GatewayThenOkGetClient),
            patch.object(supabase_store.asyncio, "sleep", AsyncMock()) as sleep,
        ):
            response = await supabase_store._request("get", "https://example.test/rest/v1/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(_GatewayThenOkGetClient.calls, 2)
        sleep.assert_awaited_once()

    async def test_supabase_post_timeout_is_not_retried(self):
        _AlwaysTimeoutPostClient.calls = 0

        with (
            patch.object(supabase_store.httpx, "AsyncClient", _AlwaysTimeoutPostClient),
            patch.object(supabase_store.asyncio, "sleep", AsyncMock()) as sleep,
        ):
            with self.assertRaises(HTTPException) as raised:
                await supabase_store._request(
                    "post",
                    "https://example.test/rest/v1/events",
                    json={"title": "No duplicate retry"},
                )

        self.assertEqual(raised.exception.status_code, 504)
        self.assertEqual(_AlwaysTimeoutPostClient.calls, 1)
        sleep.assert_not_awaited()

    async def test_supabase_rest_request_does_not_use_environment_proxy(self):
        _CapturingOkGetClient.init_kwargs = {}

        with patch.object(supabase_store.httpx, "AsyncClient", _CapturingOkGetClient):
            response = await supabase_store._request(
                "get",
                "https://example.test/rest/v1/events",
            )

        self.assertEqual(response.status_code, 200)
        self.assertIs(_CapturingOkGetClient.init_kwargs["trust_env"], False)

    async def test_list_events_paginates_past_default_supabase_page(self):
        with (
            patch.object(supabase_store, "_base", return_value="https://example.test/rest/v1"),
            patch.object(supabase_store, "EVENT_PAGE_SIZE", 2),
            patch.object(
                supabase_store,
                "_request",
                AsyncMock(
                    side_effect=[
                        _JsonResponse(200, [_event_row("event-1"), _event_row("event-2")]),
                        _JsonResponse(200, [_event_row("event-3")]),
                    ]
                ),
            ) as request,
        ):
            events = await supabase_store.list_events("user-1")

        self.assertEqual([event.id for event in events], ["event-1", "event-2", "event-3"])
        offsets = [
            dict(call.kwargs["params"])["offset"]
            for call in request.await_args_list
        ]
        self.assertEqual(offsets, ["0", "2"])

    async def test_create_event_uses_conflict_window_not_full_history(self):
        body = EventCreate(
            title="Windowed conflict check",
            date=date(2026, 8, 15),
            start_time=time(10, 0),
            duration_minutes=60,
        )

        with (
            patch.object(supabase_store, "_base", return_value="https://example.test/rest/v1"),
            patch.object(
                supabase_store,
                "list_events",
                AsyncMock(side_effect=AssertionError("full history should not be read")),
            ),
            patch.object(
                supabase_store,
                "list_events_window",
                AsyncMock(return_value=[]),
            ) as list_events_window,
            patch.object(
                supabase_store,
                "_request",
                AsyncMock(return_value=_JsonResponse(201, [_event_row("created", body.title)])),
            ),
        ):
            created = await supabase_store.create_event("user-1", body)

        self.assertEqual(created.id, "created")
        list_events_window.assert_awaited_once_with(
            "user-1",
            date(2026, 8, 14),
            date(2026, 8, 16),
        )


class TestIcsExportReportRegression(unittest.IsolatedAsyncioTestCase):
    async def test_export_ics_returns_calendar_payload_with_created_event(self):
        event = EventResponse(
            id="event-1",
            user_id="user-1",
            title="Tier2 ICS Export abc123",
            date=date(2026, 8, 15),
            start_time=time(10, 0),
            duration_minutes=60,
            participants="team",
        )

        with patch.object(
            export.data_access,
            "list_events",
            AsyncMock(return_value=[event]),
        ):
            response = await export.export_ics({"id": "user-1"})

        body = response.body.decode("utf-8")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/calendar", response.media_type)
        self.assertEqual(
            response.headers["content-disposition"],
            "attachment; filename=timeora.ics",
        )
        self.assertIn("BEGIN:VCALENDAR", body)
        self.assertIn("BEGIN:VEVENT", body)
        self.assertIn("Tier2 ICS Export abc123", body)


if __name__ == "__main__":
    unittest.main()
