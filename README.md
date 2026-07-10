# ⏰ Timeora — Your Intelligent Time Companion

<div align="center">
  <img src="./frontend/public/logomark_text.png" alt="Timeora Logo" width="400"/>
</div>

> AI-powered natural language scheduling app. Built for **TestSprite Hackathon Season 3** — *"Build the Loop"*.

## 🔗 Live

**App:** [https://timeora-alpha.vercel.app](https://timeora-alpha.vercel.app)

## 📰 Write-up & demo

| Resource | Link |
|----------|------|
| **Medium** — *Building Timeora with a Real Loop: How I Used TestSprite CLI in Hackathon Season 3* | [Read on Medium](https://medium.com/@bagusardinp/building-timeora-with-a-real-loop-how-i-used-testsprite-cli-in-hackathon-season-3-cf755d4e2845) |

---

## ✨ Features

### Natural-language scheduling and assistant

The AI calendar chat understands Indonesian and English. It can create, query,
reschedule, cancel, and find free slots from commands such as:

- *"Jadwalkan meeting tim marketing besok jam 2 siang selama 45 menit"*
- *"Pindahkan standup ke jam 3 sore"*
- *"What do I have on Friday?"*
- *"Cari waktu kosong 2 jam besok"*

OpenAI/OpenRouter is used when available. A deterministic bilingual parser
takes over during provider outages and clearly marks the result as an offline
parse.

The chat keeps session history, shows typing/confirmation feedback, returns
structured event cards for calendar questions, and asks a clarification question
when a cancel/reschedule command matches more than one event. Calendar mutations
run through native backend tools and still require explicit confirmation.

### Calendar and scheduling intelligence

- Weekly/day calendar with create, read, update, delete, drag, and resize
- Rich event details: description, meeting URL, priority, tags, and reminders
- Hover/tap event previews with safe meeting links and Gmail search links
- Right-click event actions plus Android-visible overflow actions for edit,
  delete, and Ask AI
- Conflict detection on create and update, including explained alternative slots
- Daily, weekday, weekly, and monthly recurring events
- Soft delete with one-click Undo
- `.ics` export for Google Calendar, Apple Calendar, and Outlook
- `.ics` import with duplicate UID and conflict protection
- Foreground browser notifications with in-app fallback reminders. Gmail support
  is intentionally limited to a pre-filled Gmail search link; automatic Gmail
  meeting-link extraction needs a connected Gmail OAuth scope and is not enabled
  in the standalone web app.

### Integration foundation

- Outgoing webhooks for event create, update, delete, and restore
- HMAC signatures, retries, SSRF protection, per-user limits, and sync logs
- Resend email notifications for event participants
- Encrypted provider token storage for Google, Zoom, Slack, Microsoft, and Notion
- Integrations settings UI at `/integrations`

### Actionable time analytics

- Weekly workload, deep-work, and fragmentation insights
- One-click **Block focus time** and **Spread load** actions
- Day-by-hour availability heatmap with recommended free windows

### Secure sessions

Supabase email/password authentication includes refresh tokens. API access
tokens require a valid signature, issuer, audience, expiry, and subject.
Legacy HS256 tokens use the configured secret; ES256/RS256 tokens use the
project JWKS.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router) + TypeScript + shadcn/ui + Framer Motion |
| **Backend** | FastAPI (Python 3.11) + asyncpg |
| **Database** | PostgreSQL via Supabase |
| **Auth** | Supabase Auth (email/password, JWT) |
| **AI Parsing** | OpenAI/OpenRouter + deterministic bilingual fallback |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Railway |
| **Testing & CI/CD** | TestSprite CLI + GitHub Actions |

---

## 🔄 Loop Engineering

Built with a strict **write → verify → fail → fix → verify** loop against **public**
URLs (not localhost). Full chronological log, scorecard, and failure index:
**[`LOOP.md`](./LOOP.md)** (iterations **#1–#30**).

> Timeora is a bilingual AI scheduling product where the TestSprite loop forced
> production decisions — forged-JWT rejection, dual DB failover on Railway,
> FullCalendar agent-hard UI, and locale correctness — proven by a **65/65** live
> suite plus **227** unit tests, not a one-shot demo.

### Final scorecard

| Metric | Value |
|--------|------:|
| Loop iterations | **30** |
| TestSprite live (cloud) | **65/65** (25 BE + 40 FE) |
| Backend unit | **152/152** |
| Frontend unit | **75/75** |
| Product bugs closed under the loop | **8+** |
| CI gate | Fail on non-pass TestSprite + deploy revision checks |

### How TestSprite changed the product

| # | Decision | Loop signal | Outcome |
|---|----------|-------------|---------|
| 1 | **JWT security** (`#19`) | Forged JWT still returned 200 under MVP `verify_signature: False` | Strict JWKS/HS256 claims; CI no longer soft-passes |
| 2 | **DB production** (`#2`, `#7`–`#8`) | Live login / create-event failed with `db: disconnected` | Session pooler + Supabase REST failover |
| 3 | **Category drag** (`#21`) | Three cloud fails on persist/attribute before green | Stable `data-timeora-*` DOM + evaluate-click harness |
| 4 | **Locale** (`#25`–`#26`) | EN UI got Indonesian assistant text via naive `,id` match | q-value locale parse + BE/FE re-verify |
| 5 | **Deploy + CI honesty** (`#11`, `#19`–`#20`, `#23`) | Stale Railway, false-green gates, 502 report set | Root deploys, fixed-ID GHA, failure bundles on fail |

Detail and platform IDs for each case: [LOOP.md — How TestSprite Changed Timeora](./LOOP.md#how-testsprite-changed-timeora).

### Verification coverage

| Layer | What it covers | Current result |
|---|---|---|
| Backend unit | JWT security, bilingual parsing, conflict ranking, recurrence, analytics, availability, ICS, integrations, event details, native assistant tools | **152/152 passed** (local) |
| Frontend unit | API hardening, calendar actions, assistant chat, reminders, dialogs, session, i18n helpers | **75/75 passed** (local Vitest) |
| Frontend static | ESLint + strict TypeScript | **Passed** |
| Frontend build | Next.js production bundle | **Passed** |
| **TestSprite live suite** | Cloud checks against the public app (not localhost) | **65/65 passed** · 0 failed · 0 blocked · 0 draft |

#### TestSprite suite (live)

| Split | Count | Status |
|---|---:|---|
| Backend API tests | 25 | passed |
| Frontend browser tests | 40 | passed |
| **Total** | **65** | **all green** |

Representative live coverage (not every edge case — strong on core + major features):

- **Auth & security** — register/login, refresh, signed JWT / security smoke
- **NL scheduling** — hybrid EN/ID parse, conflict alternatives
- **Assistant** — create, query, reschedule, cancel, find free slot, confirm flows, voice control
- **Calendar** — E2E create, rich details, recurring (dialog + NL), soft-delete undo, event actions
- **Export / integrations** — `.ics` export paths, ICS import + webhook foundation
- **Analytics** — weekly insights, block-focus action, availability heatmap
- **Product UX** — EN/ID language switch, landing bilingual demo, category/templates/agenda/theme/profile

Honest scope note: TestSprite is the **live checker** for the loop. It does **not** claim exhaustive coverage of every polish path (e.g. full OAuth providers, browser notification runtime, every mobile-only gesture). Those remain local unit tests and manual demo.

### Failure evidence (committed)

Judges can open artifacts in-repo (not only the TestSprite dashboard):

| Story | Path |
|-------|------|
| Category drag fail→fix | [`.testsprite/failure-category-v7/`](./.testsprite/failure-category-v7/), [`v8/`](./.testsprite/failure-category-v8/) |
| Templates / agenda | [`.testsprite/failure-template-v3/`](./.testsprite/failure-template-v3/) …, [`.testsprite/failure-agenda-v2/`](./.testsprite/failure-agenda-v2/) |
| Early FE / CORS | [`.testsprite/failure-frontend/`](./.testsprite/failure-frontend/) |
| Later run receipts | [`.testsprite/runs/`](./.testsprite/runs/) |

Full index: [LOOP.md — Committed failure evidence](./LOOP.md#committed-failure-evidence).

### Judge demo path (≈60s)

1. Live app → register/sign-in
2. AI chat: create event (EN or ID) → confirm on calendar
3. Soft-delete → Undo; optional category drag
4. Language toggle EN ↔ ID
5. [`LOOP.md`](./LOOP.md) scorecard → case study #1 or #3 → open a failure folder

### CI/CD verification gate

GitHub Actions runs local quality checks first, waits for the matching Vercel
revision and a healthy Railway deployment, then executes fixed TestSprite
backend and frontend test IDs. Failed or blocked TestSprite verdicts fail the
workflow and trigger failure-bundle collection; they are not converted into
false-green builds.

### Deployment branches

- Vercel frontend tracks `main`.
- Railway backend tracks `backend`.
- After backend fixes land on `main`, fast-forward `backend` from `main` and
  push `backend` so production runs the same verified commit.

---

## 📂 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (includes DB status) |
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login (email + password) |
| `GET` | `/api/events` | List user events |
| `POST` | `/api/events` | Create event (with conflict detection) |
| `GET` | `/api/events/{id}` | Get single event |
| `PUT` | `/api/events/{id}` | Update event with conflict checking |
| `DELETE` | `/api/events/{id}` | Soft-delete event |
| `POST` | `/api/events/{id}/restore` | Restore a deleted event |
| `POST` | `/api/parse` | Hybrid AI/offline natural-language parse |
| `POST` | `/api/assistant` | Query, find slot, preview, and execute assistant actions |
| `POST` | `/api/events/check-conflict` | Check time slot conflicts |
| `GET` | `/api/analytics/week` | Weekly workload and insight actions |
| `GET` | `/api/analytics/availability` | Availability heatmap and best slots |
| `POST` | `/api/analytics/actions/block-focus` | Add a recommended focus block |
| `POST` | `/api/analytics/actions/spread-load` | Rebalance the busiest weekday |
| `GET` | `/api/export/ics` | Export the calendar as iCalendar |
| `POST` | `/api/events/import-ics` | Import an iCalendar file |
| `GET` | `/api/integrations` | List provider readiness and connection status |
| `PUT` | `/api/integrations/{provider}` | Store an encrypted provider connection |
| `DELETE` | `/api/integrations/{provider}` | Disconnect a provider |
| `GET` | `/api/webhooks` | List outgoing webhook subscriptions |
| `POST` | `/api/webhooks` | Register an outgoing webhook |
| `DELETE` | `/api/webhooks/{id}` | Delete an outgoing webhook |
| `POST` | `/api/auth/refresh` | Refresh an expired access token |

---

## 🚀 Local Development

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # Fill in your env vars
# From the repository root, link Supabase once and apply pending migrations:
# npx --yes supabase@latest link --project-ref <project-ref>
# npx --yes supabase@latest db push
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
# Create .env.local and set NEXT_PUBLIC_API_URL
npm run dev
```

### Environment Variables

**Backend** (`.env`):
```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
INTEGRATION_ENCRYPTION_KEY=...
INTEGRATION_SIGNING_KEY=...
INTEGRATION_RESEND_API_KEY=...
INTEGRATION_RESEND_FROM_EMAIL=Timeora <notifications@example.com>
INTEGRATION_EMAIL_NOTIFICATIONS_ENABLED=false
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## ✅ Local Verification

```bash
# Backend
cd backend
python -m unittest discover -s tests -v

# Frontend
cd frontend
npm test
npm run lint
npx tsc --noEmit
npm run build
```

### Manual TestSprite verification

Project: `fe31e397-bb11-4aae-af0f-2916b246b3f5` · suite target **65/65 passed**.

```bash
testsprite auth status

# Full suite status (expect passed: 65, failed/blocked/draft: empty)
testsprite test list \
  --project fe31e397-bb11-4aae-af0f-2916b246b3f5 \
  --output json

testsprite test list --project fe31e397-bb11-4aae-af0f-2916b246b3f5 --status failed
testsprite test list --project fe31e397-bb11-4aae-af0f-2916b246b3f5 --status blocked

# Spot-check a frontend gate (example)
testsprite test run 5c7bac18-9569-4c14-af7f-17d3bb6d6909 \
  --target-url https://timeora-alpha.vercel.app \
  --wait --timeout 600 --output json
```

---

## 📋 Submission Info

| Field | Value |
|-------|-------|
| **Hackathon** | TestSprite Season 3 — "Build the Loop" |
| **Creator** | Bagus Ardin Prayoga |
| **Account** | bagusardinp@gmail.com |
| **GitHub** | [github.com/bagusardin25/Timeora](https://github.com/bagusardin25/Timeora) |
| **Live app** | [timeora-alpha.vercel.app](https://timeora-alpha.vercel.app) |
| **TestSprite suite** | **65/65 passed** (25 backend + 40 frontend) on the live app |
| **Loop log** | [`LOOP.md`](./LOOP.md) · iterations #1–#30 |
| **Medium write-up** | [Building Timeora with a Real Loop](https://medium.com/@bagusardinp/building-timeora-with-a-real-loop-how-i-used-testsprite-cli-in-hackathon-season-3-cf755d4e2845) |

---

*Built with ❤️ and verified with TestSprite — because shipping without testing is just hoping.*
