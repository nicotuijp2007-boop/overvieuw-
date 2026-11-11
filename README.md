# Usage limits dashboard

A personal dashboard that shows, in one place, how close you are to the limits of the
services you use (Claude, Supabase, Netlify, n8n, …). It's hosted on Netlify behind a
password, so you can open it from any computer or phone. Data that only exists on your
computers (Claude Code logs and plan limits) is sent to it by a small sync script.

> **Status:** dashboard, manual entries, Claude, Netlify and Supabase connectors, hosting
> on Netlify, an iPhone/Mac widget and the dashboard as a home-screen app. n8n is planned for when you start using it; history and trend charts are next.

## How it works

```
                 ┌─────────── Netlify (password protected) ───────────┐
browser ───────▶ │ dashboard ──▶ Netlify API, Supabase Management API │
                 │     │                                               │
your computers ─▶│ /api/ingest/claude (INGEST_SECRET)                  │
(sync script)    └─────┼───────────────────────────────────────────────┘
                       ▼
          Supabase Postgres, schema usage_dashboard
          (manual entries, Claude usage + plan limits)
```

```
limits.config.ts          your plan caps, one entry per service (edit by hand)
.env.local                secrets for local use (gitignored; .env.example is the template)
src/connectors/           one file per service + index.ts (the list) + types.ts
src/lib/runner.ts         runs all connectors in parallel, merges manual values, fills limits
src/lib/db.ts             Postgres connection; creates the usage_dashboard tables on first use
src/proxy.ts              password prompt in front of everything except /api/ingest/, /api/widget, icons
src/lib/present.ts        the Dutch texts and the order of the limits, shared by the page and /api/widget
src/app/page.tsx          the dashboard
src/app/api/ingest/claude receives data from the sync script
src/app/api/widget        read-only JSON for the widget (WIDGET_TOKEN); docs/prompts/widget-api-contract.md
widgets/scriptable        the iPhone/Mac widget (Scriptable), with Node tests: npm run test:widget
scripts/statusline.mjs    Claude Code status line: records plan limits, triggers the sync
scripts/sync-claude.mjs   sends Claude Code usage + plan limits to the dashboard
```

- The dashboard (in Dutch) shows everything as **what's left** ("28% over"), most urgent first:
  limits that will run out before their reset at the current pace come first (soonest first),
  then the rest by % left. The headline at the top is the most urgent limit.
- Each bar fills with what's left. The black marker shows how much **time** is left in the
  period (tap or hover it); a bar shorter than the marker means you run out before the reset.
  The period comes from the source, or from `period` in `limits.config.ts` (e.g. for manual values).
- Status: OK (more than 30% left), Let op (10–30%), Kritiek (less than 10%), always with an
  icon and a word. The status tiles at the top filter the list.
- Every page load or **Vernieuwen** fetches all enabled connectors in parallel, on the server.
  Tokens never reach the browser. Values are also stored as snapshots (at most every 10 minutes,
  or when they change) in `usage_dashboard.snapshots`: used for the sparkline per limit and, when
  a source fails, to keep showing its last known values with a small warning.
- A connector that throws or takes longer than 8s only affects **its own card**
  (Netlify stops functions after 10s); its last known values stay visible.
- If an API doesn't return the plan cap, the limit comes from `limits.config.ts`.
- Bar colors: green under 70%, yellow 70–90%, red above 90%.
- Each metric has a badge for where its value came from: `api`, `local` (sent from your
  computers) or `manual`.

## Setup

### 1. Database (Supabase)

The dashboard stores its own data in your Supabase project, in a separate
`usage_dashboard` schema (created automatically, it doesn't touch your other tables).

In the Supabase dashboard: **Connect** (top bar) → **Transaction pooler** → copy the
connection string (port 6543) and put your database password in it. Don't know the
password? Project Settings → Database → Reset database password. That's your
`DATABASE_URL`.

### 2. Secrets

Pick two new random values:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

Use one output as `INGEST_SECRET` (shared with your computers). Choose a
`DASHBOARD_PASSWORD` you can type on your phone.

### 3. Netlify site

1. app.netlify.com → **Add new project** → **Import an existing project** → GitHub →
   this repository.
2. **Branch to deploy: `main`.** Every production deploy costs 15 of your 300 monthly
   credits on the Free plan, so deploy from a branch that only changes when you want an
   update. Don't deploy from a branch that gets lots of pushes.
3. Before deploying, add these under **Site configuration → Environment variables**
   (see `.env.example` for what each is):

   | Variable | Required |
   |---|---|
   | `DATABASE_URL` | yes |
   | `DASHBOARD_PASSWORD` | yes (the site refuses to load without it) |
   | `INGEST_SECRET` | yes, for Claude data |
   | `DASHBOARD_TIMEZONE` | recommended, e.g. `Europe/Amsterdam` (Netlify runs in UTC) |
   | `NETLIFY_TOKEN` | for the Netlify card |
   | `SUPABASE_TOKEN` | for the Supabase card |
   | `WIDGET_TOKEN` | for the widget (see **Widget op iPhone en Mac**) |

4. Deploy. Open the site; the browser asks for a username (anything) and the password.

Page loads also use a little of your Netlify credits (function compute and requests),
which the Netlify card's estimate doesn't include.

### 4. Each computer where you use Claude Code

The scripts need only Node.js 20+ (no `npm install`). Quickest: clone the repo, then run
the setup script from its folder. It writes `.env.local`, points Claude Code's status line
at `scripts/statusline.mjs` (backing up `~/.claude/settings.json` first and keeping any
status line you already have), and runs a test sync:

```bash
node scripts/setup-claude-sync.mjs --url https://your-site.netlify.app --secret <INGEST_SECRET> --name laptop
```

Or do the same by hand:

1. Clone this repo somewhere permanent.
2. Create `.env.local` in it:

   ```
   DASHBOARD_URL=https://your-site.netlify.app
   INGEST_SECRET=the-same-value-as-on-netlify
   MACHINE_NAME=work-laptop
   ```

3. Add the status line to `~/.claude/settings.json` (see **Claude (Pro)** below).
4. Test it once: `npm run sync`. It should print `Sent … session-days …`.

### Running locally instead

`npm install`, put the dashboard variables in `.env.local`, then `npm run dev` and open
http://localhost:3000. Without `DASHBOARD_PASSWORD`, `npm run dev` doesn't ask for a
password. Point `DASHBOARD_URL` at `http://localhost:3000` to sync to the local copy.

The two demo cards (`mock`, and `mock-broken` to show how errors look) are off; set
`enabled: true` for them in `limits.config.ts` to see them.

## Widget op iPhone en Mac

Een widget die in één oogopslag laat zien hoeveel je nog over hebt, meest urgent eerst, met
dezelfde teksten als het dashboard. Hij draait in de gratis app **Scriptable** en leest
`/api/widget` met een eigen, alleen-lezen sleutel (`WIDGET_TOKEN`). Je wachtwoord en de tokens
van Netlify en Supabase komen niet op je telefoon.

| Formaat | Wat je ziet |
|---|---|
| Klein | De meest urgente limiet: "% over" groot, status (icoon + woord), naam, wanneer hij op is |
| Middel | De 3 meest urgente limieten, met een dunne balk van wat er over is |
| Groot | Alle limieten (tot 7), de kopregel van het dashboard en "Bijgewerkt hh:mm" |
| Vergrendelscherm | Rechthoek: de meest urgente limiet met status; rond: "% over" |

De widget ververst ongeveer elke 15 minuten (iOS bepaalt het precieze moment). Elke verversing
kost een beetje Netlify-credits (functietijd). Daarom geeft `/api/widget` binnen 10 minuten het
vorige antwoord terug uit de database, in plaats van alle diensten opnieuw te vragen. Lukt verversen
niet, dan toont hij de laatste gegevens met "niet ververst · hh:mm". Tik erop om het dashboard
te openen.

### 1. Widgettoken maken en in Netlify zetten

1. Maak een sterke token. Op de iPhone: app **Wachtwoorden** → **+** → website
   `usage-dashboard-e00568.netlify.app` (jouw site), gebruikersnaam `widget`, en kies het
   voorgestelde sterke wachtwoord. Op de Mac kan ook: `openssl rand -hex 32` in Terminal.
   Bewaar hem in Wachtwoorden; zet hem niet in een chat, mail of gewone notitie.
2. Netlify → je site → **Site configuration** → **Environment variables** → **Add a variable**
   → **Add a single variable**. Key `WIDGET_TOKEN`, value de token (vink **Contains secret
   values** aan als die optie er is) → **Create variable**.
3. Een variabele werkt pas na de volgende deploy.

### 2. Scriptable instellen (iPhone)

1. Installeer **Scriptable** uit de App Store.
2. Open `widgets/scriptable/usage-widget.js` in deze repo op GitHub, tik op **Raw** en kopieer
   alles.
3. Scriptable → **+** → plak → tik bovenaan op de naam en noem het script `Limieten`.
4. Tik op ▶︎. Vul de URL van je dashboard in (`https://usage-dashboard-e00568.netlify.app`) en
   plak de token (uit Wachtwoorden). Ze worden bewaard in de sleutelhanger van Scriptable.
5. Kies **Voorbeeld middel** om te zien of het werkt. Zie je "Token onjuist", controleer dan
   de token in Netlify en of er daarna gedeployd is.

Later wijzigen of wissen: open het script in Scriptable → ▶︎ → **Instellingen wijzigen of
wissen**. Laat het tokenveld leeg om de huidige token te houden.

### 3. Widget toevoegen

- **Beginscherm:** houd een lege plek ingedrukt → **Wijzig** → **Voeg widget toe** → zoek
  **Scriptable** → kies klein, middel of groot → **Voeg widget toe**. Tik daarna op de widget
  (in wiebelmodus) → **Script**: `Limieten`. Tikken op de widget opent altijd het dashboard;
  **When Interacting** hoef je niet in te stellen.
- **Vergrendelscherm:** houd het vergrendelscherm ingedrukt → **Pas aan** → **Toegangsscherm**
  → tik op het widgetvak → **Scriptable** → rechthoek of rond → tik erop en kies `Limieten`.
- **Mac** (macOS Sonoma of nieuwer, met dezelfde Apple-account en de iPhone in de buurt of op
  hetzelfde wifi): klik rechts op het bureaublad → **Wijzig widgets** → kies links
  **iPhone-widgets** (of zoek **Scriptable**) → sleep de widget naar het bureaublad. Zie je
  geen iPhone-widgets: Systeeminstellingen → **Bureaublad en Dock** → zet **Gebruik
  iPhone-widgets** aan.

### Dashboard op het beginscherm

1. Open het dashboard in **Safari** op je iPhone.
2. Tik op de deelknop (vierkant met pijl) → **Zet op beginscherm** → **Voeg toe**. Het icoon
   heet "Limieten".
3. Open het via het icoon en log in met je dashboardwachtwoord (gebruikersnaam maakt niet uit).

Let op: in een app op het beginscherm toont iOS de inlogvraag van de browser (Basic auth) niet
altijd betrouwbaar en onthoudt hij hem niet altijd. Een eigen login (met Supabase) volgt later.
Werkt het icoon niet, open het dashboard dan gewoon in Safari.

### Token vervangen (roteren)

Doe dit als je telefoon kwijt is of als de token ergens terecht is gekomen waar hij niet hoort.

1. Maak een nieuwe token (zie stap 1) en vervang de waarde van `WIDGET_TOKEN` in Netlify.
2. Deploy. Vanaf dat moment werkt de oude token niet meer: de widget toont "Token onjuist"
   (of de laatste gegevens met "niet ververst").
3. In Scriptable: ▶︎ → **Instellingen wijzigen of wissen** → plak de nieuwe token → **Opslaan**.

## Claude (Pro)

There's no API for Pro plan usage, so the Claude card is filled from your computers by
`scripts/sync-claude.mjs`. It sends two things:

**1. Session (5-hour) and weekly limits, via the status line.** Claude Code passes these (as
a %, with reset times) to your [status line](https://code.claude.com/docs/en/statusline)
command. `scripts/statusline.mjs` saves them and starts the sync in the background, at
most every 5 minutes. Add this to `~/.claude/settings.json`, using the absolute path to
this repo on that computer:

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

**2. Claude Code token usage, from local logs.** The sync reads
`~/.claude/projects/**/*.jsonl` (including subagent logs) for the last 35 days and sends
totals per session per day. Click **Details** on the card for per-day and per-session tables.
- Claude Code writes the same response to the log several times, so entries are
  de-duplicated on message id + request id (as `ccusage` does).
- Only token counts, model, time, session id and the project **folder name** are sent.
  Conversation text and full paths never leave your computer.
- Claude Code deletes logs after `cleanupPeriodDays` (default 30), but the dashboard keeps
  what was already sent.
- Logs somewhere else? Set `CLAUDE_CONFIG_DIR` in that computer's `.env.local`.

Limitations:
- Plan limits only update while you use Claude Code. Usage on claude.ai counts toward the
  same limits but won't show until Claude Code's next response.
- Claude Code only sends limits after the first response in a session.
- Once a window's reset time passes, the card shows 0% with a note until a new value comes in.
- With several computers, the most recently recorded limits are shown, and token usage
  is added up across all of them.

You can always override a value with a manual entry. When there's both a manual entry and
a recorded value for the same metric, the newer one is shown.

## Netlify

Set `NETLIFY_TOKEN` (and `NETLIFY_ACCOUNT` to a team slug if you're in more than one
team). The card shows, for the current billing period:

- **Credits**: an **estimate** of credits used by the whole team (all sites), out of your
  plan's included credits. Netlify's API has a "credits used" field, but it stays 0, so the
  card adds up the meters itself, at Netlify's 2026 rates (top of `src/connectors/netlify.ts`):
  production deploys × 15, bandwidth × 20 per GB, compute × 10 per GB-hour and requests × 2 per
  10,000. Netlify doesn't report compute or requests via its API, so those are measured by the
  dashboard itself: every page load, widget refresh and sync is counted with its duration in
  `usage_dashboard.invocations` (`src/lib/metering.ts`). Not included: requests for static
  files, refused logins, and functions of your other sites. Check the Usage page now and then.
- **Function runs**: how often this dashboard's own function ran this period, and how long.
- **Production deploys**: counted from each site's deploy list.
- **Bandwidth** and **build minutes**: raw usage, for context.

The credits, bandwidth and build-minute numbers come from endpoints the Netlify dashboard
uses but that aren't in Netlify's public API reference, so they could change without notice.
If the card errors after a Netlify update, that's the likely cause. Check the credits value
against your team's **Usage** page now and then.

## Supabase

Set `SUPABASE_TOKEN`. Create it under supabase.com/dashboard → avatar →
Account preferences → Access Tokens. Use a **scoped** token with **read** access to
projects, usage/analytics and database, and nothing else.
`SUPABASE_PROJECTS` (comma-separated refs or names) limits the card to some projects.

Per project the card shows:

| Metric | How |
|---|---|
| Database size | `pg_database_size()` via the read-only SQL endpoint |
| Storage size | sum of file sizes in `storage.objects` |
| Monthly active users | users who signed in during the last 30 days (approximation of billed MAU) |
| API requests (7 days) | analytics usage endpoint, for context (no limit on Free) |

SQL runs through `/database/query/read-only`, which uses a read-only transaction, so the
dashboard can't change your data. **Egress isn't available via the API**: add it as a
manual entry ("Egress", in GB) from your organization's Usage page.

With several projects, metric names get the project name appended (e.g.
`Database size · my-app`) and the Free plan limits from `limits.config.ts` apply to each.

## n8n (planned)

Not built yet, because there's no instance to test against. When you set up n8n:

- **Self-hosted:** the connector will count production executions per month via
  `GET /api/v1/executions` (header `X-N8N-API-KEY`, created in your instance under
  Settings → n8n API). Community Edition has no execution quota, so it's shown for info.
- **n8n Cloud:** the quota isn't available via the API. Executions can still be counted
  via the API, with your plan's cap in `limits.config.ts`.

Until then, the n8n card is hidden (`enabled: false` in `limits.config.ts`).

## Manual entries

For values no API exposes (for example Supabase egress), use **Handmatige waarden** at
the bottom of the dashboard. Use the metric name from `limits.config.ts` (the form suggests
them) so the limit and period are applied; give a reset date to get the pace marker. They're stored in the `usage_dashboard.manual_entries` table.

The service must be a key from `limits.config.ts`. Leave the limit empty to use the limit
from config. Saving the same service + metric again replaces the old value. Manual values
show a **manual** badge and when they were entered.

## Secrets

Never commit secrets: `.env*` files except `.env.example` are gitignored, and the app
never logs tokens. On Netlify, secrets go in the site's environment variables.

| Variable | Where to get it |
|---|---|
| `NETLIFY_TOKEN` | app.netlify.com → User settings → Applications → Personal access tokens |
| `SUPABASE_TOKEN` | supabase.com/dashboard → avatar → Account preferences → Access Tokens (scoped, read-only) |
| `DATABASE_URL` | Supabase → Connect → Transaction pooler |
| `DASHBOARD_PASSWORD`, `INGEST_SECRET` | you choose them (see Setup) |
| `WIDGET_TOKEN` | you make it: `openssl rand -hex 32`, or a strong password from the iPhone Passwords app |
| `N8N_API_KEY` (planned) | your n8n instance → Settings → n8n API |

## Adding a new connector

1. Create `src/connectors/<service>.ts`:

   ```ts
   import type { Connector } from "./types";

   export const example: Connector = {
     id: "example", // must match the key in limits.config.ts
     async fetchUsage() {
       const token = process.env.EXAMPLE_TOKEN;
       if (!token) throw new Error("EXAMPLE_TOKEN is not set");

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

4. If it needs a token, add the variable (empty) to `.env.example`, and to the Netlify
   environment variables.

## Roadmap

1. ~~Scaffold, config, connector interface, mock connector~~
2. ~~Dashboard UI with mock data and manual entries~~
3. Real connectors: ~~Claude Code local logs~~ → ~~Netlify~~ → ~~Supabase~~ → n8n (when you start using it)
3b. ~~Hosting on Netlify with password, Supabase storage and the sync script~~
4. History of every fetch (in Supabase) and 30-day trend charts
5. Later: scheduled fetching and alerts above 90%
