from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app import data_access
from app.models import (
    ConflictCheckRequest,
    ConflictCheckResponse,
    EventCreate,
    EventResponse,
    EventUpdate,
)

router = APIRouter()


@router.get("", response_model=list[EventResponse])
async def list_events(user: dict = Depends(get_current_user)):
    return await data_access.list_events(user["id"])


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(body: EventCreate, user: dict = Depends(get_current_user)):
    return await data_access.create_event(user["id"], body)


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    return await data_access.get_event(event_id, user["id"])


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    body: EventUpdate,
    user: dict = Depends(get_current_user),
):
    return await data_access.update_event(event_id, user["id"], body)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    await data_access.delete_event(event_id, user["id"])


@router.post("/check-conflict", response_model=ConflictCheckResponse)
async def check_conflict(
    body: ConflictCheckRequest, user: dict = Depends(get_current_user)
):
    if not data_access.db_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected",
        )
    conflict, title, alts = await data_access.check_conflict(
        user["id"], body.date, body.start_time, body.duration_minutes
    )
    if conflict:
        return ConflictCheckResponse(
            conflict=True,
            conflicting_event_title=title,
            alternatives=alts,
        )
    return ConflictCheckResponse(conflict=False)