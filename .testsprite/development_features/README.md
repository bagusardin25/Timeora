# TestSprite feature coverage plans

Frontend plans for Timeora live verification via TestSprite CLI.  
Default UI locale is **English**. Target URL must be passed explicitly:

```bash
TARGET=https://timeora-alpha.vercel.app
testsprite test create --plan-from <plan.json> --run --wait --timeout 900 --target-url "$TARGET"
```

Project: `fe31e397-bb11-4aae-af0f-2916b246b3f5`

## Plan index

| File | Feature | Notes |
|------|---------|--------|
| `01`–`07` | Category, templates, agenda, profile, theme, voice (legacy Command Bar), integrations | Earlier development suite |
| `08-i18n-language-switch` | EN/ID language switch + persistence | P0 |
| `09-assistant-free-slot-create` | Free-slot → create via docked chat | P0 |
| `10-assistant-voice-input` | Mic control on AssistantPanel | P0 |
| `11-assistant-confirm-create` | NL create + Create event confirm | P0 |
| `12-availability-heatmap` | Availability sidebar heatmap | |
| `13-insights-block-focus` | Block Focus Time action | |
| `14-assistant-query-schedule` | Query schedule in docked chat | |
| `15-assistant-reschedule-confirm` | Reschedule + confirm | |
| `16-assistant-cancel-confirm` | Cancel + confirm (chat-only) | Agent often ambiguous on calendar DOM |
| `17-rich-event-details` | Description / priority fields | |
| `18-landing-demo-bilingual` | Landing bilingual + interactive demo | |
| `19-recurring-event-ui` | Weekly via assistant NL (dialog has no Repeats control) | BE expand covers recurrence API |
| `20-event-actions-menu` | Edit / Delete / Ask AI menu | Flaky FullCalendar anchors |
| `21-register-login-e2e` | Register smoke → auth surface | |
| `22-ics-export-header` | Export .ics from **account dropdown** | |
| `23-soft-delete-undo` | Soft delete + Undo | |

## Backend scripts (`.testsprite/*.py`)

Also covered: health, login, register, parse (ID+EN), JWT smoke, refresh, ICS, soft delete, recurring expand, analytics, availability, insights actions, assistant query/cancel/create/find_slot, Accept-Language locales, rich event fields, integrations.

## After runs

1. Append `LOOP.md` with maker / verify / failure / fix  
2. Prefer `--no-auto-heal` on final evidence runs  
3. Fix app bugs found by the loop (e.g. Accept-Language q-value parsing) before re-running FE
