from __future__ import annotations

from datetime import date, time

from fastapi import HTTPException, status

from app import data_access
from app.models import AssistantRequest, EventCreate, EventUpdate


def _time_value(value: str | None) -> time | None:
    if not value:
        return None
    parts = value.split(":")
    return time(
        int(parts[0]),
        int(parts[1]),
        int(parts[2]) if len(parts) > 2 else 0,
    )


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
        return "create", await data_access.create_event(
            user_id,
            EventCreate.model_validate(body.event_data),
        )

    if not body.event_id:
        raise HTTPException(status_code=400, detail="event_id is required for this action")
    event_id = body.event_id.split("_")[0]

    if action in {"cancel", "delete"}:
        await data_access.delete_event(event_id, user_id)
        return "cancel", {"event_id": event_id, "deleted": True}

    if action == "reschedule":
        new_time = _time_value(body.new_time)
        if not body.new_date or new_time is None:
            raise HTTPException(
                status_code=400,
                detail="new_date and new_time are required for reschedule",
            )
        updated = await data_access.update_event(
            event_id,
            user_id,
            EventUpdate(date=date.fromisoformat(body.new_date[:10]), start_time=new_time),
        )
        return "reschedule", updated

    if action in {"edit", "update"}:
        if not body.event_data:
            raise HTTPException(status_code=400, detail="event_data is required for update")
        updated = await data_access.update_event(
            event_id,
            user_id,
            EventUpdate.model_validate(body.event_data),
        )
        return "update", updated

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
