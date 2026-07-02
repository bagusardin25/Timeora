# ⏰ Timeora — Your Intelligent Time Companion

> AI-powered natural language scheduling app. Built for **TestSprite Hackathon Season 3** — *"Build the Loop"*.

## 🔗 Live URLs

| Service | URL |
|---------|-----|
| **Frontend** | [https://timeora-alpha.vercel.app](https://timeora-alpha.vercel.app) |
| **Backend API** | [https://timeora-production.up.railway.app](https://timeora-production.up.railway.app) |
| **API Health** | [https://timeora-production.up.railway.app/api/health](https://timeora-production.up.railway.app/api/health) |

---

## ✨ Features

### 1. Natural Language Scheduling (AI-Powered)
Type natural language like *"Jadwalkan meeting tim marketing besok jam 10 selama 45 menit"* and our AI parses it into a structured event with title, date, time, and duration — all from a sleek **Command Bar** (⌘K).

### 2. Interactive Weekly Calendar (Full CRUD)
A beautiful weekly calendar powered by FullCalendar with:
- **Create** events by clicking time slots or using the AI Command Bar
- **Read** events displayed as color-coded blocks on the calendar
- **Update** events via drag-and-drop, resize, or clicking to edit
- **Delete** events with one click from the event dialog

### 3. Smart Conflict Detection
When a new event overlaps with an existing one, the backend detects the conflict and returns AI-suggested alternative time slots. The frontend renders an orange warning banner with clickable alternatives.

### 4. Session Authentication
Email/password login via Supabase Auth with JWT-protected API endpoints. Includes registration and login pages with a premium, modern UI.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router) + TypeScript + shadcn/ui + Framer Motion |
| **Backend** | FastAPI (Python 3.11) + asyncpg |
| **Database** | PostgreSQL via Supabase |
| **Auth** | Supabase Auth (email/password, JWT) |
| **AI Parsing** | OpenRouter API (GPT-4o-mini) |
| **Frontend Hosting** | Vercel |
| **Backend Hosting** | Railway |
| **Testing & CI/CD** | TestSprite CLI + GitHub Actions |

---

## 🔄 Loop Engineering (Hackathon Core)

This project was built with a strict **write → verify → fail → fix → verify** loop, documented transparently in [`LOOP.md`](./LOOP.md).

### TestSprite Loop Coverage

| # | Checkpoint | Type | Status |
|---|-----------|------|--------|
| 1 | Health endpoint | Backend | ✅ Passed |
| 2 | Login endpoint | Backend | ✅ Passed |
| 3 | Frontend skeleton + Login UI | Frontend | ✅ Passed |
| 4 | Calendar UI + CRUD | Frontend | ✅ Passed |
| 5 | Command Bar + NL AI Parse | Frontend | ✅ Passed |
| 6 | Register flow (API + UI) | Backend + Frontend | ✅ Passed |
| 7 | E2E: Register → Login → Create Event | Frontend | ✅ Passed (auth) / ⚠️ DB intermittent |
| 8 | Final E2E: Full flow with Command Bar | Frontend | 🔄 Phase 5 |

### CI/CD Integration (+5 Innovation Points)

TestSprite CLI is wired into GitHub Actions (`.github/workflows/testsprite.yml`). Every push to `main` automatically triggers the full test suite against the live deployment.

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
| `PUT` | `/api/events/{id}` | Update event |
| `DELETE` | `/api/events/{id}` | Delete event |
| `POST` | `/api/parse` | Parse natural language → structured event |
| `POST` | `/api/events/check-conflict` | Check time slot conflicts |

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
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local    # Set NEXT_PUBLIC_API_URL
npm run dev
```

### Environment Variables

**Backend** (`.env`):
```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
OPENROUTER_API_KEY=...
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
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
