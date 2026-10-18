# AquaCollective

AquaCollective brings everyday water observations together on a community map. It includes a FastAPI + SQLite API and a responsive HTML/CSS/vanilla-JS frontend.

> Community observations are not laboratory measurements and are not a substitute for certified drinking-water testing. The risk labels are simple indicators based on reported sensory observations; do not use them to determine whether water is safe to drink.

## Requirements

- Python 3.11 or newer
- pip
- An internet connection for Google Fonts, OpenStreetMap map tiles, Leaflet, and Chart.js CDN assets

## Run locally

From the project root in PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Interactive API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), and the health check is [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health).

Edit `backend/.env` before deployment. Set a long, random `SECRET_KEY`, `ENVIRONMENT=production`, an appropriate `DATABASE_URL`, and the exact trusted frontend origins in `CORS_ORIGINS`. The local SQLite database is created automatically as `backend/aquacollective.db`.

## Accounts and researcher access

At `/register.html`, users can choose a citizen or researcher account. Administrator accounts are never selectable at sign-up and must be assigned out of band by an administrator, for example using SQLite:

```sql
UPDATE users SET role = 'researcher' WHERE email = 'researcher@example.org';
```

Only `researcher` and `admin` accounts can access `/research/stats`, `/research/export`, and the full `/reports/export` CSV. This authorization is enforced by the backend as well as the role-aware frontend. The research export omits free-text notes and place names, removes time-of-day, and rounds coordinates to two decimal places; it remains community-submitted, de-identified observation data rather than laboratory data.

The researcher workspace supports publishing, editing, and deleting research (only its author or an admin may edit/delete); browsing other researchers' publications; optional PDF or external-link attachments; saved browser-local filters; generated descriptive summaries; location comparisons; CSV/JSON exports; and collaboration requests saved to the requester's account. PDF uploads are limited to 10 MB, checked for a PDF signature, and require researcher authorization to download. Collaboration requests are stored for follow-up and do not send email automatically.

Research API routes (`/research/publish`, `/research/publish/file`, `/research/published`, `/research/published/my`, `/research/published/{id}`, `/research/files/{filename}`, `/research/summary`, `/research/compare`, `/research/export/json`, and `/research/collaborations`) require researcher or admin authorization.

## Main API routes

| Route | Access | Purpose |
|---|---|---|
| `POST /auth/register` | Public | Create a citizen or researcher account; admin is not selectable |
| `POST /auth/login` | Public | Obtain a bearer JWT and role (OAuth2 password form: `username` is the email) |
| `GET /auth/me` | Signed in | Current account |
| `POST /reports/` | Signed in | Submit an observation |
| `GET /reports/` | Public | Browse reports; optional `lat`, `lng`, `radius_km`, and `limit` filters |
| `GET /reports/mine` | Signed in | Current user's observations |
| `GET /reports/{report_id}` | Public | Fetch one report |
| `GET /reports/export` | Researcher/admin | Download the full community CSV |
| `POST /validations/` | Signed in | Agree/disagree with another user's report |
| `GET /map/markers`, `GET /map/heatmap` | Public | Map marker and heat data |
| `GET /predictions/risk?lat=…&lng=…` | Public | Nearby-observation concern estimate |
| `GET /dashboard/stats` | Signed in | Personal and community counts |
| `GET /research/stats`, `GET /research/export` | Researcher/admin | Aggregates and filtered de-identified CSV |

Report submission and voting require bearer tokens. Water reports record color, smell, taste, turbidity, observed algae/green growth, unusual insects, and source type; choosing `Other` as the source requires a source description. A user cannot validate their own report; each account has one editable vote per report. Passwords use Passlib's bcrypt-SHA256 scheme. Trust starts at a neutral 0.5 and is updated with a neutral prior as votes arrive. A report becomes validated or rejected after at least three votes and a sufficiently strong consensus.

The public CSV export and research export include Date, Time, Latitude, Longitude, Location, Color, Smell, Taste, Turbidity, Algae / Green growth, Unusual insects, Source type, Other source, Notes, Trust Score, and Status. User-controlled text is escaped for CSV spreadsheet formula injection.

On startup, the app adds any missing observation columns to an existing SQLite `reports` table and fills legacy reports with neutral defaults for algae, insects, and source type.

## Project structure

```text
backend/app/       FastAPI app, database, models, routers, services, auth utilities
frontend/          Static pages, styles, and vanilla JavaScript
```
