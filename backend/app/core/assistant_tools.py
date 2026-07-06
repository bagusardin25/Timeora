from __future__ import annotations

from datetime import date, time

from fastapi import HTTPException, status
from pydantic import ValidationError

from app import data_access
from app.models import AssistantRequest, EventCreate, EventUpdate


def _time_value(value: str | None) -> time | None:
    if not value:
        return None
    try:
        parts = value.split(":")
        return time(
            int(parts[0]),
            int(parts[1]),
            int(parts[2]) if len(parts) > 2 else 0,
        )
    except (TypeError, ValueError, IndexError):
        return None


def _date_value(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except (TypeError, ValueError):
        return None


def _validation_error(error: ValidationError) -> HTTPException:
    first_error = error.errors()[0] if error.errors() else {}
    field = ".".join(str(item) for item in first_error.get("loc", []))
    message = first_error.get("msg", "Invalid value")
    detail = f"Invalid event data: {field} {message}".strip()
    return HTTPException(status_code=400, detail=detail)


def _event_create_payload(payload: dict) -> dict:
    normalized = dict(payload)
    if "recurrence_rule" not in normalized and "recurrence" in normalized:
        normalized["recurrence_rule"] = normalized["recurrence"]
    return normalized


async def execute_calendar_tool(user_id: str, body: AssistantRequest):
    action = body.action
    if not action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action is required when confirm=true",
        )

    if action == "create":
        if not body.event_data:
            raise HTTPException(status_code=400, detail="event_data is required for create")
        try:
            event_data = EventCreate.model_validate(_event_create_payload(body.event_data))
        except ValidationError as exc:
            raise _validation_error(exc) from exc
        return "create", await data_access.create_event(
            user_id,
            event_data,
        )

    if not body.event_id:
        raise HTTPException(status_code=400, detail="event_id is required for this action")
    event_id = body.event_id.split("_")[0]

    if action in {"cancel", "delete"}:
        await data_access.delete_event(event_id, user_id)
        return "cancel", {"event_id": event_id, "deleted": True}

    if action == "reschedule":
        new_time = _time_value(body.new_time)
        new_date = _date_value(body.new_date)
        if new_date is None or new_time is None:
            raise HTTPException(
                status_code=400,
                detail="new_date and new_time are required for reschedule",
            )
        updated = await data_access.update_event(
            event_id,
            user_id,
            EventUpdate(date=new_date, start_time=new_time),
        )
        return "reschedule", updated

    if action in {"edit", "update"}:
        if not body.event_data:
            raise HTTPException(status_code=400, detail="event_data is required for update")
        try:
            event_data = EventUpdate.model_validate(body.event_data)
        except ValidationError as exc:
            raise _validation_error(exc) from exc
        updated = await data_access.update_event(
            event_id,
            user_id,
            event_data,
        )
        return "update", updated

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
