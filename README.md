# Usage limits dashboard

A personal dashboard that shows, in one place, how close you are to the limits of the
services you use (Claude, Supabase, Netlify, n8n, …). It runs locally on your own machine
because one data source is your local Claude Code logs.

> **Status:** dashboard, manual entries, Claude Code, Netlify and Supabase connectors are done.
> The n8n connector comes next.

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

## Claude (Pro)

The Claude card combines two local sources. Neither needs a token.

**1. Token usage from Claude Code logs.** The connector reads every
`~/.claude/projects/**/*.jsonl` file (including subagent logs) and shows today's and the last
7 days' tokens. Click **Details** on the card for per-day and per-session tables.
- Claude Code writes the same response to the log several times, so entries are
  de-duplicated on message id + request id (as `ccusage` does).
- Only token counts, model, time, session id and project folder are read. Conversation
  text is ignored.
- Claude Code deletes logs older than `cleanupPeriodDays` (default 30), so older days
  drop out of the Details page.
- Logs somewhere else? Set `CLAUDE_CONFIG_DIR` in `.env.local`.

**2. Session (5-hour) and weekly limits via the status line.** There is no API for Pro plan
limits. Claude Code does pass them (as a %, with reset times) to your
[status line](https://code.claude.com/docs/en/statusline) command, so
`scripts/statusline.mjs` saves them to `data/claude-rate-limits.json` for the dashboard.
Add this to `~/.claude/settings.json`, using the absolute path to this repo:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/overvieuw-/scripts/statusline.mjs"
  }
}
```

Your status line will then show something like `Opus · 5h 42% · 7d 18%`. If you already
have a status line command, keep it by putting it after `--`:

```json
"command": "node /absolute/path/to/overvieuw-/scripts/statusline.mjs -- ~/.claude/my-statusline.sh"
```

Limitations:
- The values only update while you're using Claude Code. Usage on claude.ai counts toward
  the same limits but won't show until Claude Code's next response.
- Claude Code only sends limits after the first response in a session.
- Once a window's reset time passes, the dashboard shows 0% with a note until Claude Code
  records a new value.

You can always override these with a manual entry. When there's both a manual entry and a
recorded value for the same metric, the newer one is shown.

## Netlify

Set `NETLIFY_TOKEN` in `.env.local` (and `NETLIFY_ACCOUNT` to a team slug if you're in
more than one team). The card shows, for the current billing period:

- **Credits**: an **estimate** of credits used, out of your plan's included credits.
  Netlify's API does return a "credits used" field, but it isn't kept up to date (it said 0
  while the Usage page said 90). So the card computes production deploys × 15 + bandwidth
  GB × 10 instead, which matched the Usage page. Usage of functions and requests isn't
  included. If you use those, check the Usage page now and then, and adjust the rates at
  the top of `src/connectors/netlify.ts` if needed.
- **Production deploys**: counted from each site's deploy list.
- **Bandwidth** and **build minutes**: raw usage, for context.

The credits, bandwidth and build-minute numbers come from endpoints the Netlify dashboard
uses but that aren't in Netlify's public API reference, so they could change without notice.
If the card errors after a Netlify update, that's the likely cause. Check the credits value
against your team's **Usage** page now and then.

## Supabase

Set `SUPABASE_TOKEN` in `.env.local`. Create it under supabase.com/dashboard → avatar →
Account preferences → Access Tokens. Use a **scoped** token with **read** access to
projects, usage/analytics, database and disk config, and nothing else.
`SUPABASE_PROJECTS` (comma-separated refs or names) limits the card to some projects.

Per project the card shows:

| Metric | How |
|---|---|
| Database size | `pg_database_size()` via the read-only SQL endpoint |
| Storage size | sum of file sizes in `storage.objects` |
| Monthly active users | users who signed in during the last 30 days (approximation of billed MAU) |
| Disk used | disk utilization endpoint (includes indexes, WAL and system files) |
| API requests (7 days) | analytics usage endpoint, for context (no limit on Free) |

SQL runs through `/database/query/read-only`, which uses a read-only transaction, so the
dashboard can't change your data. **Egress isn't available via the API**: add it as a
manual entry ("Egress", in GB) from your organization's Usage page.

With several projects, metric names get the project name appended (e.g.
`Database size · my-app`) and the Free plan limits from `limits.config.ts` apply to each.

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
| Claude Code | none | Reads local logs under `~/.claude/projects`, plus the status line file (see above) |

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
3. Real connectors: ~~Claude Code local logs~~ → ~~Netlify~~ → ~~Supabase~~ → n8n
4. SQLite history of every fetch and 30-day trend charts
5. Later: scheduled fetching and alerts above 90%
