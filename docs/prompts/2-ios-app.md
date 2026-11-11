Je bouwt in een **nieuwe, lege GitHub-repo** een native iOS-app ("Limieten") met widgets, als
persoonlijke tegenhanger van de app Dashify, maar dan voor mijn eigen gebruikslimieten-dashboard.
Communiceer met mij in het Nederlands. Code, commits en code-comments in het Engels.

## Context

- Ik heb al een dashboard (repo `nicotuijp2007-boop/overvieuw-`, live op
  https://usage-dashboard-e00568.netlify.app) dat mijn limieten van Claude Pro, Supabase Free en
  Netlify Free combineert. Het biedt een alleen-lezen JSON-endpoint `GET /api/widget` met een
  Bearer-token (`WIDGET_TOKEN`). **Deze app gebruikt alleen dat endpoint.** Hij praat nooit
  rechtstreeks met Netlify, Supabase of Claude, en bewaart geen tokens van die diensten.
- Het API-contract staat hieronder (versie 1) en ook in die repo in
  `docs/prompts/widget-api-contract.md`. Volg het exact; behandel onbekende velden als optioneel.
- Ik heb een Mac met Xcode en een iPhone. **Jij draait in een Linux-container zonder Xcode en zonder
  simulator**: je kunt de iOS-app niet bouwen of uitvoeren. Ontwerp de werkwijze daarop (zie
  "Werkwijze"). Ik bouw op mijn Mac en stuur je de fouten of screenshots.
- Ondertekening: ik begin met een gratis Apple-account (personal team). Dan werkt de app 7 dagen
  per installatie, en sommige capabilities zijn beperkt. Een betaald account ($99/jaar) is later
  mogelijk. Controleer welke capabilities (App Groups, Keychain Sharing) een personal team
  ondersteunt en kies een aanpak die met het gratis account werkt; leg je keuze uit.
- Geheimen: zet nooit tokens in code of commits, en vraag me nooit om ze in de chat te plakken.
  De widgettoken vul ik in de app zelf in.

## API-contract v1 (samenvatting)

`GET {dashboardUrl}/api/widget` met `Authorization: Bearer <token>` → `200` JSON:
`{ version, generatedAt, dashboardUrl, summary: { ok, warn, danger, headline }, limits: [ { id,
service, serviceName, metric, leftPct, usedPct, used, limit, unit, leftText, level: "ok"|"warn"|
"danger", resetsAt|null, elapsed (0..1)|null, runsOutAt|null, urgency|null, source:
"api"|"local"|"manual", fetchedAt, stale } ], problems: [ { service, name, hasValues, message } ] }`.
`limits` staat al gesorteerd op urgentie. `401` bij een foute token, `503` als de server niet is
ingesteld. Tijden zijn ISO 8601 UTC.

Weergaveregels: toon altijd wat er **over** is (`leftPct`/`leftText`), nooit "% gebruikt" als
hoofdgetal. Status altijd met icoon + woord: OK (> 30% over), Let op (10–30%), Kritiek (< 10%).
Kleuren: OK `#0ca30c` (balken gedempt grijsgroen), Let op `#fab219`, Kritiek `#d03b3b`. Tekst nooit
in de statuskleur. Balken vullen zich met wat er over is. Als `elapsed` bekend is, toon een
streepje op `1 - elapsed` (tijd over in de periode): een balk korter dan het streepje betekent
"op vóór de reset".

## Wat de app moet doen

**App (SwiftUI, iOS 17+)**
- Instellingen: dashboard-URL en widgettoken invoeren, "Verbinding testen" (laat duidelijk 401,
  netwerkfout en succes zien), token wissen. Token in de Keychain.
- Hoofdscherm: de kopregel uit `summary`, statuschips met aantallen (filteren op status) en de lijst
  van limieten zoals op het dashboard: volledige rijen voor limieten met een reset of die niet OK
  zijn, compacte rijen voor de rest. Pull-to-refresh, "Bijgewerkt {relatieve tijd}".
- Detailscherm per limiet: getallen, reset (datum + aftelling), urgentie, bron, versheid.
- Knop "Open dashboard" (Safari) en een link naar de Details-pagina.
- Offline/fout: toon de laatst bewaarde respons met een lichte melding en tijdstip, geen rode blokken.
- Nederlandse teksten, Dynamic Type, VoiceOver-labels, licht en donker.

**Widgets (WidgetKit)**
- systemSmall: de meest urgente limiet ("% over" groot, icoon, naam, urgentie of reset).
- systemMedium: de 3 meest urgente limieten als rijen (icoon, naam, dunne balk, "% over").
- systemLarge: alle limieten plus de kopregel.
- accessoryCircular (vergrendelscherm): een gauge van "% over" van de meest urgente limiet.
  accessoryRectangular: naam + "% over" + urgentie.
- Timeline: verversen ongeveer elke 15 minuten. Gebruik bij een fout de laatste cache, met
  "niet ververst". Tikken opent de app op die limiet (deeplink `limieten://limit/<id>`).
- De widget moet de instellingen en cache van de app kunnen lezen. Gebruik daarvoor bij voorkeur een
  App Group (gedeelde `UserDefaults` en bestand) plus gedeelde Keychain. Werkt dat niet met een
  personal team, bedenk dan een veilig alternatief en leg het uit.
- Optioneel later: een macOS-widget (multiplatform-target), alleen als ik daarom vraag.

## Werkwijze (belangrijk, omdat je geen Xcode hebt)

1. **Projectstructuur zonder handgeschreven `.pbxproj`:** gebruik XcodeGen (`project.yml`).
   Ik draai `brew install xcodegen && xcodegen generate` op mijn Mac. Targets: de app, de
   widgetextensie, en een lokaal Swift Package `LimitenKit` met alle niet-UI-logica.
2. **`LimitenKit` (pure Swift, Foundation, geen SwiftUI/WidgetKit):** Codable-modellen volgens het
   contract, een API-client (URLSession, timeouts, foutmapping naar Nederlandse meldingen), de cache,
   formattering (nl-NL getallen, relatieve tijd "3m geleden", duur "4d 15u") en de selectie- en
   sorteerlogica voor de widgets. Schrijf er XCTest-unittests voor, met JSON-fixtures die exact het
   contract volgen (ook randgevallen: `stale`, `problems`, ontbrekende optionele velden, 0% en 100%).
3. **Test wat je kunt:** installeer zo mogelijk een Swift-toolchain in de container (swift.org,
   Linux) en draai `swift build` en `swift test` voor `LimitenKit`. Lukt dat niet, zeg het eerlijk
   en houd de package klein en eenvoudig te controleren.
4. **UI-code** in SwiftUI, met `#Preview`s die voorbeelddata uit de fixtures gebruiken, zodat ik
   in Xcode meteen alle widgetformaten en schermen kan bekijken.
5. **README (Nederlands):** vereisten, `xcodegen generate`, je Team kiezen in Signing, bundle-ID's
   aanpassen, op een iPhone installeren, de 7-dagengrens bij een gratis account, widgets toevoegen
   (beginscherm en vergrendelscherm), en de URL en token invullen.
6. **Fasen, met een stop na elke fase** zodat ik op mijn Mac kan bouwen en jou de uitvoer of
   screenshots stuur:
   - Fase 1: repo-skelet, `project.yml`, `LimitenKit` + tests, een minimale app die verbinding
     test en de ruwe lijst toont.
   - Fase 2: het volledige hoofdscherm, detail, instellingen en offline-cache.
   - Fase 3: de widgets (alle formaten), gedeelde opslag, deeplinks.
   - Fase 4: afwerking (toegankelijkheid, donker, lege en foutstatussen), app-icoon (eigen, simpel
     meter-symbool, geen merklogo's).
   Verwerk mijn buildfouten precies en verander niet meer dan nodig.

## Klaar als
- `LimitenKit`-tests slagen (of je hebt eerlijk gemeld waarom ze hier niet konden draaien).
- Ik kan met de README op mijn Mac bouwen, op mijn iPhone installeren, mijn URL en token invullen,
  en alle widgetformaten toevoegen. Ze tonen dezelfde volgorde en "% over" als het dashboard.
- Geen geheimen in de repo. De token staat alleen in de Keychain van het toestel.

Let op: deze app werkt pas als `/api/widget` live staat in het dashboard (een aparte taak in de
dashboard-repo). Tot die tijd werk je met de fixtures. Vraag me om te bevestigen dat het endpoint
live is voordat je echte verbindingstests van mij verwacht.
