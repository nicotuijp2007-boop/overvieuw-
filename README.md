# Usage limits dashboard

A personal dashboard that shows, in one place, how close you are to the limits of the
services you use (Claude, Supabase, Netlify, n8n, …). It runs locally on your own machine
because one data source is your local Claude Code logs.

> **Status:** phases 1–2 done (scaffold, mock data, dashboard UI, manual entries).
> Real connectors come next, one at a time.

## Setup

Requires Node.js 20+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000. Out of the box you'll see two demo cards (`mock` and
`mock-broken`) plus empty cards for the real services. Turn the demo cards off by setting
`enabled: false` for them in `limits.config.ts`.

## How it works

```
limits.config.ts        your plan caps, one entry per service (edit by hand)
.env.local              tokens (gitignored; .env.example is the template)
data/manual.json        manually entered values (gitignored, created on first save)
src/connectors/
  types.ts              UsageMetric + Connector interface
  index.ts              list of all connectors
  mock.ts               demo connectors
src/lib/runner.ts       runs all connectors in parallel, merges manual values, fills limits
src/app/page.tsx        the dashboard
src/app/api/usage       GET: fetch everything as JSON
src/app/api/manual      GET/POST/DELETE manual values
```

- Every page load or **Refresh** fetches all enabled connectors in parallel, on the server.
  Tokens never reach the browser.
- A connector that throws or takes longer than 15s shows an error on **its own card only**.
- If an API doesn't return the plan cap, the limit comes from `limits.config.ts`.
- Bar colors: green under 70%, yellow 70–90%, red above 90%.
- Each metric has a badge for where its value came from: `api`, `local` (files on
  your machine) or `manual`.

## Manual entries

For values no API exposes (for example Claude Pro's session and weekly usage), use the
**Manual entry** form at the bottom of the page, or edit `data/manual.json` directly:

```json
[
  {
    "service": "claude",
    "metric": "Session (5-hour)",
    "used": 73,
    "limit": null,
    "unit": "%",
    "resetsAt": "2026-11-10T05:00:00.000Z",
    "updatedAt": "2026-11-10T00:39:00.000Z"
  }
]
```

`service` must be a key from `limits.config.ts`. A `limit` of `null` means "use the limit
from config". Saving the same service + metric again replaces the old value. Manual values
show a **manual** badge and when they were entered.

## Tokens

Put all tokens in `.env.local`. It is gitignored, and the app never logs tokens.

| Service | Variable | Where to create it |
|---|---|---|
| Netlify | `NETLIFY_TOKEN` | app.netlify.com → User settings → Applications → Personal access tokens |
| Supabase | `SUPABASE_TOKEN` | supabase.com/dashboard → Account → Access Tokens (starts with `sbp_`) |
| n8n | `N8N_API_KEY`, `N8N_BASE_URL` | Your n8n instance → Settings → n8n API |
| Claude Code | none | Reads local logs under `~/.claude/projects` |

(This table is filled in further as each connector is added.)

## Adding a new connector

1. Create `src/connectors/<service>.ts`:

   ```ts
   import type { Connector } from "./types";

   export const example: Connector = {
     id: "example", // must match the key in limits.config.ts
     async fetchUsage() {
       const token = process.env.EXAMPLE_TOKEN;
       if (!token) throw new Error("EXAMPLE_TOKEN is not set in .env.local");

       const res = await fetch("https://api.example.com/usage", {
         headers: { Authorization: `Bearer ${token}` },
       });
       // Never put the token in an error message.
       if (!res.ok) throw new Error(`Example API returned HTTP ${res.status}`);
       const data = await res.json();

       return [{
         service: "example",
         metric: "Requests",            // also the key for its limit in config
         used: data.requests,
         limit: null,                   // null = take it from limits.config.ts
         unit: "requests",
         resetsAt: data.period_end,     // optional ISO timestamp
         source: "api",
         fetchedAt: new Date().toISOString(),
       }];
     },
   };
   ```

2. Add it to the list in `src/connectors/index.ts`.
3. Add a config entry in `limits.config.ts`:

   ```ts
   example: {
     name: "Example (Free)",
     enabled: true,
     limits: {
       "Requests": { limit: 10_000, unit: "requests", where: "example.com/pricing" },
     },
   },
   ```

4. If it needs a token, add the variable (empty) to `.env.example`.

## Roadmap

1. ~~Scaffold, config, connector interface, mock connector~~
2. ~~Dashboard UI with mock data and manual entries~~
3. Real connectors: Claude Code local logs → Netlify → Supabase → n8n
4. SQLite history of every fetch and 30-day trend charts
5. Later: scheduled fetching and alerts above 90%
