from datetime import datetime

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.core.ai_parse import parse_event_with_ai
from app.models import ParseRequest, ParseResponseV2

router = APIRouter()


@router.post("/parse", response_model=ParseResponseV2)
async def parse_natural_language(
    body: ParseRequest, user: dict = Depends(get_current_user)
):
    """Hybrid AI + deterministic fallback natural-language event parse."""
    parsed = await parse_event_with_ai(body.text, today=datetime.now().date())
    # ParseResponseV2 expects a date/time typed response; pydantic coerces ISO strings.
    return ParseResponseV2(**{
        "intent": parsed.get("intent", "create"),
        "title": parsed["title"],
        "date": parsed["date"],
        "start_time": parsed["start_time"],
        "duration_minutes": parsed.get("duration_minutes", 60),
        "participants": parsed.get("participants") or "",
        "source": parsed.get("source", "ai"),
        "start_at": parsed.get("start_at"),
        "end_at": parsed.get("end_at"),
        "warnings": parsed.get("warnings") or [],
        "recurrence": parsed.get("recurrence"),
    })
