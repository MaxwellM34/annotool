# annotool

Web app for an employee to annotate side-by-side comparison images (from the LeBlanc design loop) while the system tracks active working time and auto-generates weekly invoices.

## What it does

- **Login** with Google. Only emails on the `ALLOWED_EMAILS` list can sign in.
- **Image list:** the latest comparison images per page (home, classes, summer, …) pushed in from the LeBlanc repo.
- **Annotator:** draw red rectangles on the image, type a note for each, save. Multiple rounds per image (`r1`, `r2`, …).
- **Time tracking:** while annotating, the app records *active* time. A continuous 30+ second idle gap pauses tracking; activity within 30 s is treated as continuous. Idle gaps that never resume (i.e. tab close, log out) are excluded entirely.
- **Hours dashboard:** every user sees their tracked time by day / week. Admin sees all users.
- **Weekly invoices:** every Monday the server tallies the prior week's tracked time × the user's hourly rate and produces a downloadable PDF.

## Architecture

- **Backend:** FastAPI + SQLAlchemy (async) + Postgres + Alembic. Authlib for Google OAuth. Pillow for annotated-PNG render. ReportLab for invoice PDFs.
- **Frontend:** Vite + React + TypeScript + Tailwind. SVG overlay on top of the image for rectangle drawing.
- **Hosting:** Render free tier (one web service for backend, one static site for frontend) + Neon free Postgres.
- **Ingestion:** `scripts/push_to_annotool.sh` (lives in the LeBlanc repo) uploads the newest `*-iter<N>-full.sxs.png` after each loop iteration.

## Local dev

Prereqs: Docker, Node 20+, Python 3.11+.

```bash
git clone <this repo>
cd annotool
cp .env.example .env
# Edit .env: at minimum set SESSION_SECRET, ALLOWED_EMAILS, ADMIN_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
# For local-only DB, use the docker-compose Postgres:
#   DATABASE_URL=postgresql+asyncpg://annotool:annotool@db:5432/annotool

docker compose up -d db          # start local Postgres
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

In another shell:

```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:5173
```

## Production deploy (Render)

1. **Neon:** create a free project at https://neon.tech. Copy the *pooled* connection string. Convert it to the asyncpg form: replace `postgresql://` with `postgresql+asyncpg://` and keep `?sslmode=require` (or `?ssl=require`).
2. **Google OAuth:** https://console.cloud.google.com/apis/credentials → *Create credentials → OAuth client ID → Web application*. Add `https://<your-backend>.onrender.com/auth/google/callback` to Authorized redirect URIs.
3. **Render:** connect this GitHub repo. Render picks up `render.yaml` automatically — confirm two services (`annotool-backend`, `annotool-frontend`) get created. Set the secret env vars in the Render dashboard:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ALLOWED_EMAILS`, `ADMIN_EMAIL`
   - `PUSH_TOKEN`
   - `OAUTH_REDIRECT_URI=https://<backend>.onrender.com/auth/google/callback`
   - `FRONTEND_URL=https://<frontend>.onrender.com`
4. Wait for first build. Migrations run on backend startup. Visit the frontend URL, click Sign in with Google.

## Wiring the LeBlanc loop

Copy `scripts/push_to_annotool.sh` from this repo into the LeBlanc repo's `scripts/` folder. Set in the LeBlanc `.env`:

```
ANNOTOOL_URL=https://<backend>.onrender.com
ANNOTOOL_TOKEN=<the PUSH_TOKEN value from annotool .env>
```

Then after each iteration run:

```bash
bash scripts/push_to_annotool.sh home   # pushes loop/compare/home-iter<latest>-full.sxs.png
bash scripts/push_to_annotool.sh classes
```

Or hook it into your loop's per-iteration script.

## Time-tracking rules (the precise spec)

- An "active interval" begins on the first user input event (mouse move, click, keydown, scroll) inside an annotation page.
- While active, the frontend sends a heartbeat every 10 s carrying the timestamp of the most recent input event.
- If the most recent input event is older than 30 s, the frontend stops heartbeating.
- Server side: each heartbeat extends the user's open interval. If a heartbeat arrives more than 30 s after the previous one, the previous interval is **discarded** (per the spec: "if they stop for example 2 mins and then no longer are logged in it will not add any of the 2 mins to the salary hours, although it stopped counting after 30 seconds") — only intervals that close with a clean heartbeat within 30 s of activity count toward salary.
- A nightly job sweeps still-open intervals: any interval whose last heartbeat is older than 30 s gets *closed* (with `end_ts = last_heartbeat_ts`), but if no heartbeats followed activity into the 30s grace window, that idle tail is excluded.

In practice: working 5 minutes with sub-30s pauses → 5 minutes credited. Working 5 minutes then walking away for 2 minutes then closing the tab → 5 minutes credited (the 2-minute tail isn't counted). Working 5 minutes then idle 29 s then 5 more minutes → 10 m 29 s credited.
