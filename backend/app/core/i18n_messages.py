"""Minimal ID/EN message templates for assistant responses."""

from __future__ import annotations

from typing import Literal

Locale = Literal["en", "id"]


def resolve_locale(accept_language: str | None = None, explicit: str | None = None) -> Locale:
    """Pick en/id from an Accept-Language header (highest q-value wins).

    Important: do not substring-match ``,id`` — English headers from the app look like
    ``en-US,en;q=0.9,id;q=0.8`` and must resolve to English.
    """
    if explicit in ("en", "id"):
        return explicit  # type: ignore[return-value]

    header = (accept_language or "").strip()
    if not header:
        return "en"

    best_lang: Locale = "en"
    best_q = -1.0
    for part in header.split(","):
        token = part.strip()
        if not token:
            continue
        lower = token.lower()
        if ";q=" in lower:
            lang_part, q_part = token.split(";", 1)
            q_raw = q_part.split("=", 1)[-1].strip()
            try:
                q = float(q_raw)
            except ValueError:
                q = 0.0
        else:
            lang_part, q = token, 1.0
        primary = lang_part.strip().lower().split("-", 1)[0]
        if primary not in ("en", "id"):
            continue
        if q > best_q:
            best_q = q
            best_lang = primary  # type: ignore[assignment]
    return best_lang



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
    "unknown_intent": {
        "en": 'I could not understand that request ({intent}). Try checking your schedule, finding free slots, creating/moving/cancelling an event, or ask “what can you do?”.',
        "id": 'Saya belum mengerti permintaan itu ({intent}). Coba: cek jadwal, cari slot kosong, buat/pindah/batalkan event, atau tanya “kamu bisa apa?”.',
    },
    "help": {
        "en": (
            "I am Timeora's calendar assistant. I can:\n"
            "• Check your schedule (“What is on my calendar today?”)\n"
            "• Find free slots (“Find free time tonight”)\n"
            "• Create events (“Schedule a meeting tomorrow at 10”)\n"
            "• Reschedule or cancel events\n"
            "• Update details (priority, notes, tags)\n\n"
            "Important changes still require confirmation. "
            "Try a chip below or type / speak your request."
        ),
        "id": (
            "Saya asisten kalender Timeora. Saya bisa:\n"
            "• Cek jadwal (“Apa jadwal saya hari ini?”)\n"
            "• Cari slot kosong (“Cari waktu kosong malam ini”)\n"
            "• Buat event (“Jadwalkan meeting besok jam 10”)\n"
            "• Pindahkan atau batalkan event\n"
            "• Ubah detail (prioritas, catatan, tag)\n\n"
            "Semua perubahan penting tetap minta konfirmasi dulu. "
            "Coba ketuk contoh di bawah atau ketik/ucapkan permintaan Anda."
        ),
    },
    "query_empty": {
        "en": "No events found on {date}.",
        "id": "Tidak ada event pada {date}.",
    },
    "query_found": {
        "en": "Found {count} event(s) on {date}.",
        "id": "Ditemukan {count} event pada {date}.",
    },
    "query_title_found": {
        "en": "Found {count} event(s) matching '{title}'.",
        "id": "Ditemukan {count} event yang cocok dengan '{title}'.",
    },
    "query_title_on_date_found": {
        "en": "Found {count} event(s) matching '{title}' on {date}.",
        "id": "Ditemukan {count} event yang cocok dengan '{title}' pada {date}.",
    },
    "query_title_empty": {
        "en": "No events matching '{title}' found.",
        "id": "Tidak ada event yang cocok dengan '{title}'.",
    },
    "find_slot_empty": {
        "en": "No free {duration}-minute slots on {date}.",
        "id": "Tidak ada slot kosong {duration} menit pada {date}.",
    },
    "find_slot_found": {
        "en": "Found {count} free slot(s) ({duration} min) on {date}: {slots}. Tap a slot to schedule a meeting.",
        "id": "Ditemukan {count} slot kosong ({duration} menit) pada {date}: {slots}. Ketuk slot untuk menjadwalkan meeting.",
    },
    "create_no_slots": {
        "en": 'No free {duration}-minute slot on {date} for "{title}". Try another day or duration.',
        "id": 'Tidak ada slot kosong {duration} menit pada {date} untuk "{title}". Coba hari atau durasi lain.',
    },
    "create_conflict_suggest": {
        "en": "{time} conflicts. I suggest free slot {suggested}. ",
        "id": "Jam {time} bentrok. Saya usulkan {suggested} yang kosong. ",
    },
    "create_free_picked": {
        "en": "I picked free slot {time}. ",
        "id": "Saya pilih slot kosong {time}. ",
    },
    "create_confirm": {
        "en": 'Create "{title}" on {date} at {time} ({duration} min)? Confirm to add it to your calendar.',
        "id": 'Buat "{title}" pada {date} jam {time} ({duration} menit)? Konfirmasi untuk menambah ke kalender.',
    },
    "clarification": {
        "en": "I found more than one matching event. Which one did you mean?",
        "id": "Saya menemukan lebih dari satu event yang cocok. Yang mana yang Anda maksud?",
    },
    "cancel_not_found": {
        "en": "No event matching '{title}' found to cancel.",
        "id": "Tidak ada event '{title}' yang bisa dibatalkan.",
    },
    "cancel_confirm": {
        "en": 'Cancel "{title}"? Confirm to proceed.',
        "id": 'Batalkan "{title}"? Konfirmasi untuk melanjutkan.',
    },
    "reschedule_not_found": {
        "en": "No event matching '{title}' found to reschedule.",
        "id": "Tidak ada event '{title}' yang bisa dipindahkan.",
    },
    "reschedule_need_time": {
        "en": 'I found "{title}", but I need the new date and time before I can reschedule it.',
        "id": 'Saya menemukan "{title}", tetapi butuh tanggal dan jam baru sebelum bisa dipindahkan.',
    },
    "reschedule_confirm": {
        "en": 'Reschedule "{title}" to {date} {time}? Confirm to proceed.',
        "id": 'Pindahkan "{title}" ke {date} {time}? Konfirmasi untuk melanjutkan.',
    },
    "update_not_found": {
        "en": "No event matching '{title}' found to update.",
        "id": "Tidak ada event '{title}' yang bisa diperbarui.",
    },
    "update_need_detail": {
        "en": "I found the event, but I need more detail about what to update.",
        "id": "Saya menemukan event-nya, tetapi butuh detail perubahan yang diinginkan.",
    },
    "update_confirm": {
        "en": 'Update "{title}"? Confirm to proceed.',
        "id": 'Perbarui "{title}"? Konfirmasi untuk melanjutkan.',
    },
}


def msg(key: str, locale: Locale = "en", **kwargs: object) -> str:
    template = MESSAGES.get(key, {}).get(locale) or MESSAGES.get(key, {}).get("en") or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template
