# Widget API contract (v1)

Shared by the Scriptable widget (this repo) and the native iOS app (separate repo).
Implemented in this repo at `src/app/api/widget/route.ts`.

## Request

```
GET https://<dashboard-host>/api/widget
Authorization: Bearer <WIDGET_TOKEN>
```

- `WIDGET_TOKEN` is a read-only key, set as a Netlify environment variable. It is separate
  from `DASHBOARD_PASSWORD` (login) and `INGEST_SECRET` (sync script), so it can be rotated
  on its own and can only read.
- The token is only accepted in the `Authorization` header, never in the query string.
- `/api/widget` is excluded from the Basic-auth proxy (`src/proxy.ts`), like `/api/ingest/`.

## Responses

- `200` with the JSON below, `Cache-Control: no-store`.
- `401` `{ "error": "Unauthorized" }`: missing or wrong token.
- `503` `{ "error": "WIDGET_TOKEN is not set on the server." }`.

```jsonc
{
  "version": 1,
  "generatedAt": "2026-11-11T13:09:00.000Z",
  "dashboardUrl": "https://usage-dashboard-e00568.netlify.app",
  "summary": {
    "ok": 4, "warn": 0, "danger": 0,
    // Same sentence as the dashboard's status bar, plain text, Dutch.
    "headline": "Alles binnen marge · krapst: Netlify (Free) Credits, 150 credits over"
  },
  // Sorted most urgent first (same order as the dashboard: src/lib/headroom.ts byUrgency).
  "limits": [
    {
      "id": "netlify|Credits",            // stable: service + "|" + metric
      "service": "netlify",
      "serviceName": "Netlify (Free)",
      "metric": "Credits",
      "leftPct": 50,                       // 100 - round(usedPct), never < 0
      "usedPct": 50,                       // rounded
      "used": 150,
      "limit": 300,
      "unit": "credits",
      "leftText": "150 credits over",      // Dutch, as on the dashboard
      "level": "ok",                       // "ok" | "warn" | "danger"
      "resetsAt": "2026-12-09T08:00:00.000Z",   // or null
      "elapsed": 0.07,                     // 0..1 share of the period passed, or null
      "runsOutAt": null,                   // ISO if it runs out before the reset at the current pace
      "urgency": null,                     // e.g. "Op over ~21u, vóór de reset", or null
      "source": "api",                     // "api" | "local" | "manual"
      "fetchedAt": "2026-11-11T13:09:00.000Z",
      "stale": false                       // true = source failed, last known value
    }
  ],
  // Sources that failed this time (their limits may still be in `limits` with stale: true).
  "problems": [
    { "service": "supabase", "name": "Supabase (Free)", "hasValues": true, "message": "..." }
  ]
}
```

Rules for clients:
- Show what's **left** (`leftPct` / `leftText`), never "% used" as the main number.
- Status always with an icon + word, never color alone: OK (> 30% over), Let op (10–30%),
  Kritiek (< 10%). Colors: OK `#0ca30c` (bars muted gray-green), Let op `#fab219`,
  Kritiek `#d03b3b`.
- Times are ISO 8601 UTC; format them in the device's time zone, Dutch.
- Treat unknown fields as optional; bump `version` only for breaking changes.
