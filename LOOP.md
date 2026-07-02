# Timeora — LOOP.md

Agent-written loop log. One plain-English line per iteration.

---

- [2026-07-01 #1] maker: FastAPI skeleton (health, auth, CRUD events, NL parse, conflict detect) + deployed to Railway (timeora-production.up.railway.app) | verify: `testsprite test create --type backend --name 'Health endpoint' --code-file .testsprite/test_health.py --run --wait` → status: passed | failure: none | fix: N/A
- [2026-07-01 #2] maker: fixed DB connection (DATABASE_URL IPv6 issue, used session pooler) + auto-create user row on login | verify: `testsprite test create --type backend --name 'Login endpoint' --code-file .testsprite/test_login.py --run --wait` → status: passed | failure: login returned 500 (DB pool None, DATABASE_URL unresolvable) | fix: switched to Session Pooler connection string + graceful None handling in auth.py/events.py
- [2026-07-02 #3] maker: Phase 1 (Next.js skeleton, shadcn/ui setup, login UI, API config) + deployed to Vercel (timeora-alpha.vercel.app) | verify: `testsprite test create --type backend --name 'Frontend Login UI Render' --code-file .testsprite/test_frontend_page.py --run --wait` → status: passed | failure: none | fix: N/A
