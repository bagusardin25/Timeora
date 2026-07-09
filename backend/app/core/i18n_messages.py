"""Minimal ID/EN message templates for assistant responses."""

from __future__ import annotations

from typing import Literal

Locale = Literal["en", "id"]


def resolve_locale(accept_language: str | None = None, explicit: str | None = None) -> Locale:
    if explicit in ("en", "id"):
        return explicit  # type: ignore[return-value]
    header = (accept_language or "").lower()
    if header.startswith("id") or ",id" in header or "id-id" in header:
        return "id"
    return "en"


MESSAGES: dict[str, dict[Locale, str]] = {
    "create_ok": {
        "en": "Event added to your calendar.",
        "id": "Event berhasil ditambahkan ke kalender.",
    },
    "cancel_ok": {
        "en": "Event cancelled.",
        "id": "Event berhasil dibatalkan.",
    },
    "update_ok": {
        "en": "Event updated.",
        "id": "Event berhasil diperbarui.",
    },
    "reschedule_ok": {
        "en": "Event rescheduled to {date} {time}.",
        "id": "Event berhasil dipindah ke {date} {time}.",
    },
    "conflict": {
        "en": 'Time conflicts with "{title}". Pick an alternative slot below, then confirm again.',
        "id": 'Jam bentrok dengan "{title}". Pilih slot alternatif di bawah, lalu konfirmasi lagi.',
    },
    "conflict_no_slots": {
        "en": 'Time conflicts with "{title}". Try another time or find free slots.',
        "id": 'Jam bentrok dengan "{title}". Coba jam lain atau cari slot kosong.',
    },
}


def msg(key: str, locale: Locale = "en", **kwargs: object) -> str:
    template = MESSAGES.get(key, {}).get(locale) or MESSAGES.get(key, {}).get("en") or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template
