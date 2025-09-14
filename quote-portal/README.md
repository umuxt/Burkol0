cd /opt/burkol/Burkol0/quote-portal# Burkol Quote Portal

Standalone React (CDN) + minimal Node backend with in-memory storage and TXT export.

## Structure
- `index.html`, `styles.css`, `app.js`: Frontend SPA (React via CDN)
- `server.js`: Express backend (in-memory; no JSON file persistence)

## Requirements
- Node.js 18+

## Setup
```bash
cd quote-portal
npm install
npm start
# Server: http://localhost:3001
# App:    Use your static server (e.g., 127.0.0.1:5500) or open index.html directly.
#         Frontend calls API on http://localhost:3001 by default. To override:
#         Add before app.js in index.html or in console: window.BURKOL_API = 'http://your-host:port'
```

## Endpoints
- `GET  /api/quotes` — list
- `POST /api/quotes` — create (payload: full quote JSON)
- `PATCH /api/quotes/:id` — update status
- `DELETE /api/quotes/:id` — delete
- `GET  /api/quotes/:id/txt` — generate and download TXT summary

## Notes
- Files are kept inline (base64) in memory to keep setup simple. For production, move binaries to object storage and persist in a DB.
- Admin panel includes a button to download TXT for each quote.
- After submission, the form shows a popup and resets all fields.

```text
Routes
#/teklif — quote form
#/admin  — admin panel
```

## Styling
Kept minimal, dark theme with metallic accent to align with the brand feel.

## Next
- Add auth for admin
- Swap JSON file for DB
- Streamlined PDF template per brand guidelines
