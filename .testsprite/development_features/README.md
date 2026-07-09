# New feature TestSprite plans (post–loop #23)

Plans for features shipped after the last full documented loop. Default UI locale is **English**.

## Files

| File | Focus |
|------|--------|
| `08-i18n-language-switch.plan.json` | EN → ID → persist → dashboard → back to EN |
| `09-assistant-free-slot-create.plan.json` | Docked AI chat free-slot → create → calendar |
| `10-assistant-voice-input.plan.json` | Mic control: listening **or** clear error; typed chat still works |
| `11-assistant-confirm-create.plan.json` | Natural-language create + **Create event** confirm |

## Prerequisites

1. Vercel frontend + Railway backend on latest `main` / `backend`.
2. Demo account works: `demo@timeora.app` / `TimeoraDemo123!` (same as other development plans).
3. CLI logged in; project id: `fe31e397-bb11-4aae-af0f-2916b246b3f5`.

## Create & run

From repo root:

```bash
# Required: --target-url (project has no default URL configured)
TARGET=https://timeora-alpha.vercel.app

testsprite test create \
  --plan-from .testsprite/development_features/08-i18n-language-switch.plan.json \
  --run --wait --timeout 900 --target-url "$TARGET"

testsprite test create \
  --plan-from .testsprite/development_features/09-assistant-free-slot-create.plan.json \
  --run --wait --timeout 900 --target-url "$TARGET"

testsprite test create \
  --plan-from .testsprite/development_features/10-assistant-voice-input.plan.json \
  --run --wait --timeout 900 --target-url "$TARGET"

testsprite test create \
  --plan-from .testsprite/development_features/11-assistant-confirm-create.plan.json \
  --run --wait --timeout 900 --target-url "$TARGET"
```

### Latest live results (2026-07-10)

| Plan | Test ID | Run status | Steps |
|------|---------|------------|-------|
| 08 i18n | `f40b3c5a` | passed | 13/13 |
| 09 free-slot | `e512beab` | passed | 23/23 |
| 10 voice | `cf24067d` | passed | 18/18 |
| 11 confirm-create | `2bc10fda` | passed | 14/14 |

## After each run

1. If **failed/blocked**: fix app or tighten plan steps, re-run, commit.
2. Append a line to `LOOP.md` with maker / verify / failure / fix.
3. Prefer `--no-auto-heal` on final replay when collecting evidence.
