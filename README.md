# ⏰ Timeora — Your Intelligent Time Companion

<div align="center">
  <img src="./frontend/public/logomark_text.png" alt="Timeora Logo" width="400"/>
</div>

> AI-powered natural language scheduling app. Built for **TestSprite Hackathon Season 3** — *"Build the Loop"*.

## 🔗 Live URLs

| Service | URL |
|---------|-----|
| **Frontend** | [https://timeora-alpha.vercel.app](https://timeora-alpha.vercel.app) |
| **Backend API** | [https://timeora-production.up.railway.app](https://timeora-production.up.railway.app) |
| **API Health** | [https://timeora-production.up.railway.app/api/health](https://timeora-production.up.railway.app/api/health) |

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

This project was built with a strict **write → verify → fail → fix → verify** loop, documented transparently in [`LOOP.md`](./LOOP.md).

### Verification coverage

| Layer | Coverage | Current local result |
|---|---|---|
| Backend unit | JWT security, bilingual parsing, conflict ranking, recurrence, analytics, availability, ICS, integration security, event details, native assistant tools | **116/116 passed** |
| Frontend unit | API hardening, calendar action menus, assistant chat, reminder scheduler, notification fallback, event dialog positioning | **55/55 passed** across 14 files |
| Frontend static | ESLint + strict TypeScript | **Passed** |
| Frontend build | Next.js production bundle | **Passed** |
| TestSprite backend | Health, DB, signed JWT, forged-JWT rejection, parse, availability, auth refresh, ICS export, assistant execution | **Passing** |
| TestSprite frontend | Register → login → Command Bar → save → calendar assertion, ICS download, assistant cancel confirmation | **Passing** |

The complete maker → verify → failure → fix history is documented in
[`LOOP.md`](./LOOP.md), with platform test IDs and matching commits.

Latest remediation evidence: commit `ea2e8e9` fixed the reported auth/session
502s and ICS export regression, Railway deployed it successfully, and manual
TestSprite CLI readback returned no failed or blocked tests for the project.

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

```bash
testsprite auth status

testsprite test run 2aadf520-65ff-4f1b-9e28-80406e3fbe28 \
  --target-url https://timeora-production.up.railway.app \
  --wait --timeout 300 --output json

testsprite test run 5c7bac18-9569-4c14-af7f-17d3bb6d6909 \
  --target-url https://timeora-alpha.vercel.app \
  --wait --timeout 600 --output json

testsprite --output json test list \
  --project fe31e397-bb11-4aae-af0f-2916b246b3f5 \
  --status failed

testsprite --output json test list \
  --project fe31e397-bb11-4aae-af0f-2916b246b3f5 \
  --status blocked
```

---

## 📋 Submission Info

| Field | Value |
|-------|-------|
| **Hackathon** | TestSprite Season 3 — "Build the Loop" |
| **Creator** | Bagus Ardin Prayoga |
| **Account** | bagusardinp@gmail.com |
| **GitHub** | [github.com/bagusardin25/Timeora](https://github.com/bagusardin25/Timeora) |
| **Frontend** | [timeora-alpha.vercel.app](https://timeora-alpha.vercel.app) |
| **Backend** | [timeora-production.up.railway.app](https://timeora-production.up.railway.app) |

---

*Built with ❤️ and verified with TestSprite — because shipping without testing is just hoping.*
