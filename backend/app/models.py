from datetime import date as Date, time as Time

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    date: Date
    start_time: Time
    duration_minutes: int = Field(..., ge=5, le=1440)
    participants: str = ""


class EventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    date: Date | None = None
    start_time: Time | None = None
    duration_minutes: int | None = Field(None, ge=5, le=1440)
    participants: str | None = None


class EventResponse(BaseModel):
    id: str
    user_id: str
    title: str
    date: Date
    start_time: Time
    duration_minutes: int
    participants: str


class ParsedEvent(BaseModel):
    title: str
    date: Date
    start_time: Time
    duration_minutes: int = Field(..., ge=5, le=1440)
    participants: str = ""


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


class ConflictCheckRequest(BaseModel):
    date: Date
    start_time: Time
    duration_minutes: int = Field(..., ge=5, le=1440)


class AlternativeSlot(BaseModel):
    start_time: Time
    duration_minutes: int
    reason: str = ""


class ConflictCheckResponse(BaseModel):
    conflict: bool
    conflicting_event_title: str | None = None
    alternatives: list[AlternativeSlot] = []


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6)


class AuthResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    message: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ParseResponseV2(BaseModel):
    """Hybrid AI + fallback parse result."""
    intent: str = "create"
    title: str
    date: Date
    start_time: Time
    duration_minutes: int = Field(60, ge=5, le=1440)
    participants: str = ""
    source: str = "ai"
    start_at: str | None = None
    end_at: str | None = None
    warnings: list[str] = []
    recurrence: str | None = None


class AssistantRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


class AssistantResponse(BaseModel):
    intent: str
    result: dict | list | None = None
    message: str
