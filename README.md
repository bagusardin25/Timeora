# Timeora — Your Intelligent Time Companion

AI-powered natural language scheduling app. Built for TestSprite Hackathon Season 3 "Build the Loop".

## Live URL

**Backend API:** [https://timeora-production.up.railway.app](https://timeora-production.up.railway.app)

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python 3.11) + asyncpg |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password, JWT) |
| AI Parsing | Openrouter / OpenAI |
| Deployment | Railway |
| Testing | TestSprite CLI |

## Features

- **Natural Language Scheduling** — type "Meeting with team tomorrow at 10am for 45 minutes" and AI parses it into a structured event
- **Calendar CRUD** — create, read, update, delete events
- **Conflict Detection** — detects overlapping events and suggests alternative time slots
- **Session Auth** — email/password login via Supabase Auth, JWT-protected endpoints

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Login (email + password) |
| GET | `/api/events` | List user events |
| POST | `/api/events` | Create event |
| GET | `/api/events/{id}` | Get event |
| PUT | `/api/events/{id}` | Update event |
| DELETE | `/api/events/{id}` | Delete event |
| POST | `/api/parse` | Parse natural language input |
| POST | `/api/events/check-conflict` | Check time slot conflicts |

## TestSprite Loop Coverage

| # | Test Name | Type | Status |
|---|---|---|---|
| 1 | Health endpoint | Backend | Passed |
| 2 | Login endpoint | Backend | Passed |

See [LOOP.md](./LOOP.md) for the full iteration log.

## Local Development

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env   # fill in your env vars
uvicorn app.main:app --reload --port 8000
```

## Submission

- **Hackathon:** TestSprite Season 3 — "Build the Loop"
- **Account:** bagusardinp@gmail.com
- **GitHub:** [github.com/bagusardin25/Timeora](https://github.com/bagusardin25/Timeora)
