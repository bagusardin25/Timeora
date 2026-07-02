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
