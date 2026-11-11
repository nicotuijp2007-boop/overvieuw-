Je werkt in de repo `nicotuijp2007-boop/overvieuw-`: mijn persoonlijke gebruikslimieten-dashboard
(Claude Pro, Supabase Free, Netlify Free). Communiceer met mij in het Nederlands. Code, commits en
code-comments in het Engels.

## Context (lees dit eerst)

- Lees `README.md`, `AGENTS.md`, `docs/prompts/widget-api-contract.md` en deze bestanden:
  `src/lib/headroom.ts`, `src/lib/runner.ts` (`fetchDashboard`), `src/components/LimitList.tsx`
  (`leftText`, `urgencyText`), `src/components/Overview.tsx`, `src/proxy.ts`, `src/lib/secrets.ts`.
- Stack: Next.js 16 (App Router, TypeScript, Tailwind 4), gehost op Netlify, Postgres via Supabase.
  Let op: Next 16 heeft breaking changes; `middleware.ts` heet nu `src/proxy.ts`. Lees bij twijfel
  de docs in `node_modules/next/dist/docs/`.
- Live: https://usage-dashboard-e00568.netlify.app. De hele site staat achter HTTP Basic auth
  (`DASHBOARD_PASSWORD`), behalve `/api/ingest/` (eigen `INGEST_SECRET`).
- Branches: werk op `claude/beautiful-bell-ft5y68`. Netlify deployt **alleen `main`**, en elke
  productie-deploy kost **15 van mijn 300 Netlify-credits per maand**. Push naar `main` alleen als
  ik letterlijk "deploy" zeg, en bundel werk zodat het één deploy wordt. Op de werkbranch staat al
  werk dat nog niet live is (compacte statusbalk en lijst, setupscript, snellere database-aanroepen):
  dat gaat mee in dezelfde deploy.
- Geheimen: zet nooit tokens of wachtwoorden in code, commits of de chat. Vraag me nooit om een
  token in de chat te plakken. Als je een API-sleutel nodig hebt (bijv. de Netlify-token om de
  deploystatus te volgen), gebruik het beveiligde credential-formulier van deze omgeving.
- De dashboard-UI is Nederlands, met één mentaal model: alles als **wat er over is**, gesorteerd op
  urgentie. Status altijd met icoon + woord: OK (> 30% over), Let op (10–30%), Kritiek (< 10%).

## Doel

Een widget voor mijn iPhone (en daarmee ook mijn Mac-bureaublad via "iPhone-widgets" op macOS
Sonoma+) die in één oogopslag laat zien hoeveel ik nog over heb van al mijn limieten. Plus het
dashboard als app-icoon op mijn beginscherm.

## Taken

### 1. `/api/widget` (server)
- Implementeer exact het contract in `docs/prompts/widget-api-contract.md` (versie 1) in
  `src/app/api/widget/route.ts`.
- Hergebruik de bestaande logica: `fetchDashboard()` voor de data, `headroom()` + `byUrgency` voor
  de berekening en sortering. Verplaats `leftText`, `urgencyText` en de kopregel van de statusbalk
  naar een gedeelde module in `src/lib/` (bijv. `src/lib/present.ts`), zodat de pagina en de API
  dezelfde teksten gebruiken. Pas de componenten daarop aan. Geen dubbele logica.
- Auth: `Authorization: Bearer <WIDGET_TOKEN>`, vergeleken met `safeEqual`. Geen token in de query
  string. `401`/`503` zoals in het contract. `Cache-Control: no-store`. Log nooit de token.
- Sluit `/api/widget` uit van de Basic-auth matcher in `src/proxy.ts`, zonder andere routes open te
  zetten. Test dat `/api/widgetX` nog wél om de login vraagt.
- Voeg `WIDGET_TOKEN` toe aan `.env.example`, met hoe je een sterke waarde maakt.

### 2. Scriptable-widget (`widgets/scriptable/usage-widget.js`)
- Eén bestand dat ik in de app Scriptable (iOS) plak. Ondersteunt de formaten small, medium en large,
  plus accessoryRectangular en accessoryCircular (vergrendelscherm).
  - small: de meest urgente limiet: "% over" groot, statusicoon, naam, urgentieregel.
  - medium: de 3 meest urgente limieten als rijen: icoon, naam, dunne balk (gevuld met wat er
    over is), "% over".
  - large: alle limieten, plus de kopregel en "Bijgewerkt hh:mm".
- Ontwerp volgens het dashboard: OK-balken gedempt grijsgroen, Let op `#fab219`, Kritiek
  `#d03b3b`. Iconen via SF Symbols (`checkmark.circle.fill`, `exclamationmark.circle.fill`,
  `xmark.circle.fill`). Licht én donker via `Color.dynamic`. Tekst nooit in de statuskleur.
- Instellingen: bij de eerste keer starten in de app (niet in de widget) vraagt het script via een
  `Alert` om de dashboard-URL en de widgettoken, en bewaart die in de `Keychain` van Scriptable.
  Eén menu-optie om ze te wijzigen of te wissen.
- Robuust: cache de laatste geslaagde respons met `FileManager.local()`. Bij een fout toont de widget
  de cache met "niet ververst · hh:mm", anders een nette foutstatus. `refreshAfterDate` ±15 min.
  Tikken op de widget opent de dashboard-URL.
- Je kunt Scriptable hier niet draaien. Houd de rendering dun en zet de logica (respons → rijen,
  formatting, Nederlandse teksten) in pure functies. Test die met Node, door het bestand met
  gestubde Scriptable-globals te laden (`node --test`). Draai ook `node --check`.

### 3. Dashboard als app-icoon (PWA-light)
- `manifest.webmanifest` (naam "Limieten", `display: standalone`, themakleuren voor licht en
  donker), `apple-touch-icon` en favicon. Maak een eenvoudig, eigen icoon (SVG → PNG's in de juiste
  maten): een meter-achtig symbool, geen merklogo's.
- Controleer of HTTP Basic auth werkt in iOS-standalone-modus ("Zet op beginscherm"). Lukt dat niet
  betrouwbaar, voeg dan een kleine `/login`-pagina toe die een httpOnly, Secure, SameSite=Lax-cookie
  zet (HMAC-gesigneerd met een server-secret, 30 dagen geldig). Laat `src/proxy.ts` die cookie óf
  Basic auth accepteren. Uitloggen kan via `/logout`. Leg de keuze uit.

### 4. Documentatie
- README-sectie "Widget op iPhone en Mac" in het Nederlands, stap voor stap: Scriptable installeren,
  script plakken, URL en token invullen, widget toevoegen; op de Mac via Bureaublad → Wijzig widgets
  → iPhone-widgets; dashboard op het beginscherm zetten. Plus hoe je `WIDGET_TOKEN` roteert.

### 5. (Optioneel, vraag eerst) Mac-menubalk
- Een SwiftBar-plugin (`widgets/swiftbar/limieten.15m.sh`) die `/api/widget` aanroept en
  "◔ 27%" (de meest urgente "% over") in de menubalk toont, met het menu als lijst. Let op het PATH
  in SwiftBar (Homebrew: `/opt/homebrew/bin`). De token komt uit de macOS-sleutelhanger
  (`security find-generic-password`), niet uit het script.

## Testen en controle (vóór je "klaar" zegt)
- `npx tsc --noEmit`, `npm run build`, en de Node-tests van het widgetscript.
- Start lokaal een Postgres (pg 16 staat in de container: `initdb`/`pg_ctl` als niet-root
  gebruiker) en draai `next start` met test-env. Test met curl: 200 met geldige token (valideer de
  vorm tegen het contract), 401 zonder of met een foute token, Basic auth op de andere routes
  ongewijzigd, `/api/ingest/claude` ongewijzigd.
- Maak screenshots (Playwright, ingelogd) van het dashboard op telefoonbreedte om te zien dat er
  niets is veranderd, behalve bewust gewijzigde zaken.
- Commit in kleine, duidelijke stappen op de werkbranch en push die (dat kost niets).

## Deploy (alleen na mijn "deploy")
1. Laat mij eerst `WIDGET_TOKEN` toevoegen in Netlify → Site configuration → Environment variables
   (en een eventueel nieuw cookie-secret). Leg precies uit waar. Ik maak de waarde zelf aan; geef me
   daarvoor een commando.
2. Push de werkbranch naar `main`, volg de Netlify-build tot `ready` (vraag de Netlify-token via het
   credential-formulier als je de API nodig hebt) en test daarna live: `/api/widget` met mijn token
   (via het formulier of door mij de curl te laten draaien), de login, en de pagina.
3. Rapporteer eerlijk wat werkt, wat niet getest kon worden (Scriptable zelf draait alleen op mijn
   iPhone) en wat ik moet doen.

Stop na taak 1 + 2 en laat me het widgetscript eerst zien (screenshots van een HTML-mock of de
Node-testuitvoer), vóór je aan 3 begint.
