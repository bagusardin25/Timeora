from datetime import date as Date, datetime as DateTime, time as Time
from typing import Literal

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    date: Date
    start_time: Time
    duration_minutes: int = Field(..., ge=5, le=1440)
    participants: str = ""
    recurrence_rule: str | None = None
    category: str | None = None
    external_ids: dict[str, str] = Field(default_factory=dict)


class EventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    date: Date | None = None
    start_time: Time | None = None
    duration_minutes: int | None = Field(None, ge=5, le=1440)
    participants: str | None = None
    recurrence_rule: str | None = None
    category: str | None = None


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


class AssistantResponse(BaseModel):
    intent: str
    result: dict | list | None = None
    message: str
    requires_confirmation: bool = False
    executed: bool = False


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
