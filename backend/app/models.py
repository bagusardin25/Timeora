from datetime import date as Date, datetime as DateTime, time as Time
from typing import Literal

from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


def _normalize_tags(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_tag in value:
        tag = raw_tag.strip()
        key = tag.casefold()
        if not tag or key in seen:
            continue
        seen.add(key)
        normalized.append(tag)
    return normalized


def _validate_location_url(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("location_url must use http or https")
    return normalized


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    date: Date
    start_time: Time
    duration_minutes: int = Field(..., ge=5, le=1440)
    participants: str = ""
    recurrence_rule: str | None = None
    category: str | None = None
    description: str = Field("", max_length=5000)
    location_url: str | None = Field(None, max_length=2048)
    priority: Literal["low", "normal", "important"] = "normal"
    tags: list[str] = Field(default_factory=list, max_length=20)
    reminder_minutes: int | None = Field(None, ge=0, le=10080)
    external_ids: dict[str, str] = Field(default_factory=dict)

    _location_url = field_validator("location_url")(_validate_location_url)
    _tags = field_validator("tags")(_normalize_tags)


class EventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    date: Date | None = None
    start_time: Time | None = None
    duration_minutes: int | None = Field(None, ge=5, le=1440)
    participants: str | None = None
    recurrence_rule: str | None = None
    category: str | None = None
    description: str | None = Field(None, max_length=5000)
    location_url: str | None = Field(None, max_length=2048)
    priority: Literal["low", "normal", "important"] | None = None
    tags: list[str] | None = Field(None, max_length=20)
    reminder_minutes: int | None = Field(None, ge=0, le=10080)

    _location_url = field_validator("location_url")(_validate_location_url)
    _tags = field_validator("tags")(_normalize_tags)


class EventResponse(BaseModel):
    id: str
    user_id: str
    title: str
    date: Date
    start_time: Time
    duration_minutes: int
    participants: str
    recurrence_rule: str | None = None
    category: str | None = None
    description: str = ""
    location_url: str | None = None
    priority: Literal["low", "normal", "important"] = "normal"
    tags: list[str] = Field(default_factory=list)
    reminder_minutes: int | None = None
    external_ids: dict[str, str] = Field(default_factory=dict)
    sync_status: str = "not_synced"
    last_synced_at: DateTime | None = None


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
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
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
    text: str | None = Field(None, max_length=1000)
    confirm: bool = False
    event_id: str | None = None
    action: str | None = None
    new_date: str | None = None
    new_time: str | None = None
    selected_event_id: str | None = None
    context_event_id: str | None = None
    event_data: dict | None = None


class AssistantResponse(BaseModel):
    intent: str
    result: dict | list | None = None
    message: str
    requires_confirmation: bool = False
    executed: bool = False
    clarification: dict | None = None
    events: list[dict] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


class InsightAction(BaseModel):
    type: str
    label: str
    description: str


class WeeklyInsight(BaseModel):
    """Weekly analytics summary."""
    hours_per_day: dict[str, float]
    total_hours: float
    deep_work_blocks: list[dict]
    fragmentation_score: float
    suggestion: str
    actions: list[InsightAction] = []


class InsightActionResponse(BaseModel):
    action_type: str
    message: str
    event: EventResponse | None = None


class AvailabilityCell(BaseModel):
    day: str
    hour: int
    score: float
    date: str


class AvailabilitySlot(BaseModel):
    day: str
    start_hour: int
    end_hour: int
    duration_hours: int


class AvailabilityHeatmap(BaseModel):
    days: list[str]
    hours: list[int]
    cells: list[AvailabilityCell]
    best_slots: list[AvailabilitySlot]
    availability_pct: float


WebhookEventType = Literal[
    "event.created",
    "event.updated",
    "event.deleted",
    "event.restored",
]


class WebhookSubscriptionCreate(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    event_types: list[WebhookEventType] = Field(
        default_factory=lambda: [
            "event.created",
            "event.updated",
            "event.deleted",
        ],
        min_length=1,
        max_length=4,
    )
    description: str = Field("", max_length=200)


class WebhookSubscriptionResponse(BaseModel):
    id: str
    url: str
    event_types: list[str]
    description: str = ""
    active: bool = True
    created_at: DateTime | None = None


class WebhookSubscriptionCreated(WebhookSubscriptionResponse):
    signing_secret: str


class IntegrationConnectRequest(BaseModel):
    access_token: str = Field(..., min_length=8, max_length=10000)
    refresh_token: str | None = Field(None, max_length=10000)
    metadata: dict = Field(default_factory=dict)


class IntegrationResponse(BaseModel):
    provider: str
    connected: bool
    enabled: bool
    configured: bool = False
    status: str = "available"
    metadata: dict = Field(default_factory=dict)
    updated_at: DateTime | None = None


class IcsImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
    events: list[EventResponse] = Field(default_factory=list)
