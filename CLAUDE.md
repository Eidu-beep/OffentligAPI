# Eiendomsdata-API — overlevering

Les hele denne filen før du gjør noe. Den beskriver prosjektet, gjeldende tilstand, kjente feller og hva som skal gjøres videre. Oppdater filen når status endrer seg.

Sist oppdatert: 2026-10-04.

## Prosjektet

Et kommersielt API som samler eiendomsdata fra åpne norske kilder (Kartverket, Geonorge, NGU, NVE) per adresse, og selger tilgang via API-nøkler. Brukerens egen nettside skal være én av kundene; andre kunder kommer senere.

Lisenser, sjekket i Geonorges kartkatalog 2026-10-03:

| Kilde | Lisens |
|---|---|
| Kartverket: adresser og eiendomsteiger | CC BY 4.0 |
| NGU: løsmasser og berggrunn | NLOD 2.0 |
| NVE: faresoner, flomsoner, aktsomhetskart og jordskredvarsel | NLOD 2.0 |
| DiBK: reguleringsplaner | **Ikke åpne data** («Norge digitalt begrenset»), se åpent punkt 3 |

De åpne lisensene krever kildehenvisning ("Kilde: Kartverket, NGU, NVE").

## Slik jobber du med brukeren

- Brukeren bygger dette ved hjelp av AI og har begrenset erfaring med webutvikling og deploy. Når brukeren må gjøre noe selv i GitHub, Railway eller Netlify, gi konkrete steg: hvilken side, hvilket felt, hva som skal skrives.
- Svar på norsk.
- Én endring om gangen. Gjør endringen, få den testet, og gå videre først når den fungerer.
- Si alltid nøyaktig hvilke filer som er endret, og hvordan endringen kan testes.
- 2026-10-03 ba brukeren om at mest mulig fikses uten at han er involvert. Gjør og test alt du kan selv. Spør bare om det som krever betaling, innlogging, hemmeligheter eller en godkjenning.
- Brukeren har GitHub Desktop, ikke git på kommandolinjen. Commit og push gjøres der: skriv en tekst i **Summary**, klikk **Commit to main** og deretter **Push origin**. En AI-økt med tilgang til maskinen kan gjøre det for ham når han ber om det.

## Kilden til sannhet

GitHub-repoet `Eidu-beep/OffentligAPI`, branch `main`. Arbeidsmappen skal være en klone av dette repoet (`Desktop\Eidu\OffentligAPI`). Eldre ZIP-filer fra chat (`eiendomsapi-v1` til `v6`) er utdaterte og inneholder plassholdere — ikke bruk dem.

Endringene fra 2026-10-03 og 2026-10-04 ble committet og pushet 2026-10-04 med GitHub Desktop (commit `e9c3550`, «Retter datakildene og legger databasen på volum»). Samme dag ble demo-nøkkelen satt inn i `frontend/index.html` og pushet i en egen commit, og deretter rettelsen for «Deploy crashed»-e-postene (ryddig avslutning på SIGTERM).

## Arkitektur

Tre deler. API-et og demo-siden bygges fra dette repoet, admin-siden fra et eget:

| Del | Plattform og adresse | Bygges fra | Formål |
|---|---|---|---|
| API | Railway — `https://offentligapi-production.up.railway.app` | repo-roten | Henter, cacher og serverer data |
| Demo-nettside | Netlify — `https://offentligapi.netlify.app` | mappen `frontend` | Offentlig demo av API-et |
| Admin ("igelkott") | Netlify — `https://igelkott.netlify.app` | repoet `Eidu-beep/igelkott` | Opprette og administrere API-nøkler |

Hver push til `main` trigger ny deploy på Railway og av demo-siden — også endringer som bare gjelder `frontend/` eller `admin/`.

Admin-siden deployes **ikke** av en push hit. Netlify bygger den fra repoet `Eidu-beep/igelkott` (sjekket i Netlify 2026-10-04). Mappen `admin/` i dette repoet er en kopi. Den publiserte admin-siden er lik `admin/index.html` slik filen var før 2026-10-04, så endringen fra 2026-10-04 (siden vekker API-et) er ikke publisert. Se åpent punkt 4.

Netlify-innstillinger (lest 2026-10-04): begge sidene har Base directory `/`, ingen Build command, Production branch `main` og Node 22.x. Publish directory er `frontend` for demo-siden og `admin` for admin-siden.

Samle endringer i få pusher. Netlify-kontoen har gratisplanen med 300 kreditter per måned (perioden starter den 26.), og hver produksjonsdeploy koster 15 kreditter. Pushen 2026-10-04 kostet 15, og 285 var igjen etterpå. Når kredittene er brukt opp, settes begge sidene på pause til neste periode. Forbruket står under **Usage & billing** i Netlify.

### Gjenopprettingsdokument

`Desktop\Eidu\Eiendomsdata-API_oppsett_og_gjenoppretting.pdf` ligger utenfor repoet. Det beskriver API-ene som brukes, innstillingene hos Railway og Netlify, og hvordan alt settes opp igjen. Laget 2026-10-04 på brukerens forespørsel. Det er en PDF fordi PC-en ikke har Word. Lag en ny utgave når oppsettet endres. Dokumentet skal ikke inneholde nøkler eller passord.

### Railway

Prosjektet heter `noble-fulfillment`, tjenesten `OffentligAPI`, region US West (California), og den bygges med Railpack. Volumet `offentligapi-volume` er montert på `/data` (opprettet 2026-10-04). Der ligger databasen med API-nøklene.

Bekreftet 2026-10-04: deploy-loggen viser `Database: /data/eiendom.db (persistent volum på /data)`, og databasen overlevde en Redeploy. Første oppstart logget `Migrerte 1 nøkkel(er) fra API_KEYS til database`. Etter Redeploy kom ikke den linjen, fordi nøkkelen allerede lå der. Står det `ADVARSEL: Databasen ligger ikke på et persistent volum` i loggen, er volumet ikke koblet til. Tjenesten kjører Node 22.

Planen er **Free** (valgt av brukeren 2026-10-04, etter at prøveperioden utløp):

- $1 i bruk per måned, som ikke overføres til neste måned. Minne koster $10 per GB per måned, CPU $20 per vCPU per måned og volum $0,15 per GB per måned. Når kreditten er brukt opp, stopper Railway tjenesten.
- Grenser per tjeneste: 0,5 GB minne, 1 vCPU og 0,5 GB volum.
- Regionbytte og eget domene krever betalt plan. Tjenesten blir derfor stående i US West.
- Volumet har ingen sikkerhetskopi. Backups krever Pro-plan. Går databasen tapt, kan de samme nøklene legges inn igjen med variabelen `API_KEYS` (`nøkkel:kundenavn:dagliggrense`, komma mellom), som leses når databasen er tom. Testet lokalt 2026-10-04. Brukeren er bedt om å ta vare på en liste over nøklene utenfor repoet.
- **Serverless** er slått på (Settings → Deploy). Containeren sovner etter 5–10 minutter uten trafikk og våkner på neste kall. Tjenesten kjører da bare når den er i bruk, og det reduserer forbruket. Ulempen står under «Kjente feller».
- Custom Start Command er `node server.js` (satt 2026-10-04, Settings → Deploy). Før det startet Railway tjenesten med `npm run start`, og da lå `npm` i minnet i tillegg. Startkommandoen må stå slik, ellers melder Railway hver erstattet deploy som krasjet. Se «Kjente feller».
- Anslag fra en lokal måling: Node-prosessen bruker rundt 70 MB våken, og `npm` brukte rundt 65 MB til. Med 70 MB ville en tjeneste som sto på hele måneden kostet omtrent $0,70 i minne, mot omtrent $1,35 før. Det er ikke målt i Railway. Faktisk forbruk står under **Metrics** og **Usage** der.

## Mappestruktur

```
server.js                      Inngangspunkt: helmet, CORS, rate limit, ruter, ryddig avslutning på SIGTERM
package.json                   "type": "module" er påkrevd. Node 22. `npm test` kjører testene
.gitignore                     Holder node_modules, lokal database og .env ute av repoet
src/db.js                      SQLite (better-sqlite3): tabellene nøkler og bruk. Legger databasen på volumet
src/middleware/apiNokkel.js    Sjekker X-Api-Key mot databasen og teller bruk
src/middleware/rateLimiter.js  60 kall/min per IP, 500/min globalt
src/routes/eiendom.js          GET /eiendom?adresse=...  (krever API-nøkkel)
src/routes/admin.js            /admin/*  (krever X-Admin-Key)
src/services/adresse.js        Kartverket adresse-API (JSON)
src/services/teig.js           Kartverkets eiendoms-API (JSON): teigene til matrikkelnummeret, areal
src/services/plan.js           Reguleringsplan (DiBK, WMS GetFeatureInfo som JSON). Slått av som standard
src/services/ngu.js            NGU løsmasser og berggrunn (WMS GetFeatureInfo som GML)
src/services/nve.js            NVE faresoner, flomsoner og aktsomhetskart (ArcGIS identify) + jordskredvarsel
src/utils/wms.js               HTTP-henting, domene-allowlist, URL-byggere for WMS og ArcGIS
src/utils/cache.js             In-memory cache med TTL per kilde
src/utils/geo.js               WGS84 → UTM33, arealberegning, offisiell UTM-sone per fylke
test/                          Tester. Kjører uten nettverk mot etterlignede kilder
testdata/svar.js               Svar fra de ekte tjenestene, brukt av testene
frontend/index.html            Demo-nettside (har API_URL og API_KEY øverst i <script>). Vekker API-et når siden lastes
admin/index.html               Kopi av admin-nettsiden (har API_URL øverst i <script>). Den publiserte siden bygges fra repoet igelkott
README.md, SPEC.md, STEG2.md   Eldre dokumenter. Denne filen gjelder der de sier noe annet
```

## Endepunkter

- `GET /helse` — åpen helsesjekk
- `GET /eiendom?adresse=...` — krever header `X-Api-Key` (eller `?api_key=`)
- Admin, alle med header `X-Admin-Key`: `GET /admin/status`, `GET /admin/nokler`, `POST /admin/nokler`, `PATCH /admin/nokler/:nokkel/aktiv`, `PATCH /admin/nokler/:nokkel/grense`, `DELETE /admin/nokler/:nokkel`, `GET /admin/nokler/:nokkel/historikk`

`/admin/status` har feltet `persistentLagring`. `false` betyr at databasen ikke ligger på et volum, og at nøklene slettes ved neste deploy.

## Svarformat for /eiendom

Alle blokkene har `funnet`. `feil: true` betyr at kilden ikke svarte — det er noe annet enn «ingen treff».

- `teig`: `matrikkelnummer`, `arealM2` (sum av alle teigene), `nøyaktighet`, `antallTeiger`, `fellesTeig`
- `reguleringsplan`: `plannavn`, `planid`, `plantype`, `planstatus`, `ikrafttredelse`, `lenke`, `planer`. `utilgjengelig: true` når oppslaget er slått av
- `losmasser`: `type`, `kode`, `beskrivelse`, `malestokk`
- `berggrunn`: `bergart`, `bergartsenhet`, `tilleggsbergarter`, `alder`, `tektoniskEnhet`, `datagrunnlag`
- `skredfare`: `funnet` (i kartlagt faresone), `kartlagt` (NVE har faresonekartlagt området), `soner`, `aktsomhet` (aktsomhetsområder punktet ligger i), `rapport`
- `flomsone`: `funnet`, `kartlagt`, `soner` (hver med `navn`, `intervall`, `lavpunkt`, `klima`), `aktsomhet`, `aktsomhetDekning`
- `jordskredvarsel`: `aktsomhetsniva` (1–4), `tekst`, `dato`, `hovedtekst`, `neste` (varselet for neste døgn)

`skredfare` og `flomsone` kan ha `ufullstendig: true` og `mangler: [...]` når en av delkildene ikke svarte.

Viktig for kundene: «ikke i faresone» betyr bare trygt der `kartlagt` er `true`. Ellers er det aktsomhetskartene som sier om det kan være fare. Oppslaget gjelder adressepunktet (± 1 meter), ikke hele tomten.

## Miljøvariabler i Railway

Verdiene ligger i Railway og skal aldri skrives inn i repoet. Åpne aldri «Raw Editor» under Variables — den viser alle verdiene i klartekst.

- `NODE_ENV=production`
- `ALLOWED_ORIGINS` — kommaseparerte, eksakte domener, f.eks. `https://offentligapi.netlify.app,https://igelkott.netlify.app`. `*` virker ikke.
- `ADMIN_KEY` — passordet til admin-siden
- `CACHE_MAX_KEYS=10000`
- `API_KEYS` — valgfri. Format `nøkkel:kundenavn:dagliggrense`. Legges inn i databasen kun når databasen er tom. Skal ikke være satt i produksjon. Brukeren fjernet den 2026-10-04.
- `DB_PATH` — valgfri. Når et volum er koblet til tjenesten, legges databasen automatisk på volumet. Settes `DB_PATH`, må den peke inn i mappen volumet er montert på.
- `PLAN_AKTIV` — settes til `true` for å slå på reguleringsplan. Ikke gjør det før lisensen er avklart (åpent punkt 3).

Satt per 2026-10-04: `ADMIN_KEY`, `ALLOWED_ORIGINS`, `CACHE_MAX_KEYS`, `NODE_ENV`. Ikke satt: `API_KEYS`, `DB_PATH`, `PLAN_AKTIV`. Railway setter selv `RAILWAY_VOLUME_MOUNT_PATH` når et volum er koblet til, og `src/db.js` bruker den.

## Status per datakilde

Alt under er testet 2026-10-03 med reelle kall mot tjenestene, med den samme koden som ligger i `src/`. 2026-10-04 ble det også testet gjennom det deployede API-et med demo-nøkkelen: testadressene under ga de kjente svarene, og en ukjent adresse ga 404. Et oppslag tar 1–3 sekunder gjennom Railway i US West, mot under ett sekund fra Norge.

| Kort | Status | Kilde og kommentar |
|---|---|---|
| Adresse / Matrikkel | Fungerer | `ws.geonorge.no/adresser/v1/sok` |
| Kart | Fungerer | OpenStreetMap-iframe |
| Eiendomsteig | Fikset | `ws.geonorge.no/eiendom/v1/geokoding` med `omrade=true`. Slår opp teigene til adressens matrikkelnummer og regner areal fra teiggrensene. Det gamle WFS-oppslaget svarte 500 hos Kartverket, og tok dessuten «første teig i nærheten» |
| Skredfare (NVE) | Fikset | `kart.nve.no/enterprise/rest/services`: `Skredfaresoner3`, `SkredKvikkleire2`, `SnoskredAktsomhet`, `SkredSteinAktR`, `JordFlomskredAktsomhet`, `KvikkleireskredAktsomhet`. Den gamle adressen (`KastWMTS`) var en stoppet tjeneste, og feilen ble vist som grønt |
| Flomsone (NVE) | Fikset | `Flomsoner2` og `Flomaktsomhet` på samme sted |
| Løsmasser (NGU) | Fikset | `geo.ngu.no/mapserver/LosmasserWMS2`, lag `Losmasse_flate`, GML |
| Berggrunn (NGU) | Fikset | `geo.ngu.no/mapserver/BerggrunnWMS3`, lagene `Berggrunn_regional_hovedbergarter` og `Berggrunn_nasjonal_hovedbergarter`, GML |
| Reguleringsplan | Virker, men slått av | `nap.ft.dibk.no/services/wms/reguleringsplaner/`, lagene `rpomrade_vn2` og `bebyggelseomrade_vn2`. Ikke åpne data (åpent punkt 3). Ikke alle kommuner er med, Oslo mangler |
| Jordskredvarsel (NVE) | Fikset | `api01.nve.no/hydrology/forecast/landslide/v1.0.10/api/Warning/Municipality/{kommunenr}/1/{fra}/{til}` |

### Testadresser med kjent svar (2026-10-03, bekreftet gjennom det deployede API-et 2026-10-04)

- Skredfaresone: Nordgardsleitet 82, Mjølkeråen (Bergen) — i faresone med årlig sannsynlighet ≥ 1/100, kartlagt område
- Flomsone: Nedre Rælingsveg 148, Rælingen — i sonen for 200-årsflom
- Flomsone, lavpunkt: Depotgata 9, Lillestrøm
- Kvikkleiresone: punktet 63.38099, 10.152514 i Trondheim (sonen Hafella, faregrad høy)
- Ingen treff: Storgata 1, Oslo (teig 208/619, 790 m², fyllmasse, leirskifer)
- Reguleringsplan: Torvet i Trondheim (63.4305, 10.3951) gir Midtbyplanen

## Åpne punkter, i prioritert rekkefølge

Gjort 2026-10-04: brukeren har slettet `API_KEYS` i Railway (kontrollert på variabelnavnene), byttet `ADMIN_KEY` og slettet den gamle testnøkkelen på admin-siden. Railway deployet på nytt kl. 14.42. Loggen viste databasen på volumet uten ny nøkkelmigrering, og demo-siden ga treff etterpå. Ingenting haster nå.

### 1. Avklar drift før betalende kunder

Free-planen holder til demo, men har tre svakheter for kunder: tjenesten sover og første kall etter en pause kan feile, kreditten på $1 kan ta slutt, og tjenesten står i US West. Detaljene står under «Railway» i Arkitektur. Brukeren må velge selv:

- Bli på Free. Startkommandoen er satt til `node server.js`, så kreditten rekker lenger enn før. Følg med på **Usage** i Railway den første måneden.
- Gå til Hobby (fra $5 per måned). Da kan tjenesten flyttes til EU West (Amsterdam) under Settings → Scale → Regions, og Serverless kan slås av.

### 2. Nøkler og repo

- Brukerens egen nettside skal ha en separat nøkkel som ikke ligger i offentlig kode.
- Demo-nøkkelen i `API_KEY` i `frontend/index.html` ble opprettet på admin-siden 2026-10-04. Den står i klartekst i offentlig kode, og skal derfor ha en daglig grense (brukeren ble bedt om 200).
- Gjør repoet privat. Railway og Netlify fungerer med private repoer.

### 3. Reguleringsplan: avklar lisensen

De nasjonale plandataene er merket «Norge digitalt begrenset» med Norge digitalt-lisens i Geonorge. De er altså ikke åpne data, og kan trolig ikke selges videre i et kommersielt API uten avtale. Brukeren må avklare dette med DiBK eller Kartverket. Koden virker, og slås på med `PLAN_AKTIV=true`. Til da viser kortet «Ikke tilgjengelig».

### 4. Forbedringer (lavere prioritet)

- Faresoner og flomsoner slås opp for adressepunktet. Et oppslag mot hele teigen ville fanget tomter der bare en del ligger i en sone. Teiggrensene hentes allerede i `teig.js`.
- Watch Paths i Railway, slik at endringer kun i `frontend/` eller `admin/` ikke redeployer API-et.
- Healthcheck Path `/helse` i Railway (Settings → Deploy), slik at en deploy som ikke starter ikke tar over.
- Admin-siden kan vise en advarsel når `/admin/status` sier `persistentLagring: false`.
- Admin-siden: velg én kilde. Enten kobles Netlify-siden `igelkott` til dette repoet med `admin` som mappe (da koster hver push 30 kreditter), eller så kopieres endringer i `admin/index.html` over til repoet `Eidu-beep/igelkott`.
- Netlify: la demo-siden bare deployes når `frontend/` er endret (Base directory eller en ignore-regel). Da koster en push som bare gjelder API-et ingen kreditter.
- En betalt Railway-plan (Hobby, fra $5 per måned) gir regionbytte til EU West (Amsterdam), eget domene og mulighet til å la tjenesten stå på hele tiden. Brukerne og datakildene er i Norge, og hvert oppslag går nå via California.

## Metode for å fikse en datakilde

Dette er metoden som løste alle kortene.

1. Finn ut hva tjenesten faktisk returnerer før du skriver kode. For WMS/WFS: start med `GetCapabilities` for å finne riktige lagnavn og hvilke `INFO_FORMAT`/`outputFormat` tjenesten støtter. For ArcGIS: åpne tjenesten med `?f=json` og les laglisten. Geonorges kartkatalog (`kartkatalog.geonorge.no/api/search?text=...`) viser hvilken tjeneste som er den offisielle, og hvilken lisens den har.
2. Har du nettverkstilgang til tjenesten, test selv. Hvis ikke, test gjennom brukerens nettleser, eller gi brukeren en ferdig URL å lime inn og be om å få svaret tilbake.
3. Skriv tolkeren (`tolk...`-funksjonene) mot det faktiske svaret, og legg svaret i `testdata/svar.js` med en test i `test/`.
4. Bruker en ny tjeneste et nytt domene, legg det til i `TILLATTE_DOMENER` i `src/utils/wms.js` — ellers blokkeres kallet.
5. Kjør `npm test`. Test lokalt hvis mulig: `npm install`, sett `DB_PATH=./data/eiendom.db`, `ADMIN_KEY=lokal-admin` og `API_KEYS=lokal-nokkel:Test:0`, kjør `node server.js`, og kall `http://localhost:3000/eiendom?adresse=Karl+Johans+gate+1,+Oslo&api_key=lokal-nokkel`.

## Kjente feller

- Aldri æøå i filnavn eller URL-stier. Det har feilet to ganger: filen `apiNøkkel.js` og ruten `/admin/nøkler`. Inni koden (variabelnavn, tekst, JSON-felt) er æøå trygt.
- `*` i `ALLOWED_ORIGINS` virker ikke. Bruk eksakte domener med `https://` og uten skråstrek på slutten.
- `"type": "module"` må stå i `package.json`.
- `package.json` og `server.js` må ligge i repo-roten, ellers finner ikke Railway prosjektet.
- Plassholderne `https://din-api.railway.app` og `bytt-meg` har flere ganger overskrevet brukerens ekte verdier når hele filer ble erstattet. Ikke endre `API_URL`- eller `API_KEY`-linjene med mindre det er meningen.
- Railway kan vise en gammel, feilet deploy øverst. Sjekk at du ser på den nyeste.
- ArcGIS svarer HTTP 200 med `{ "error": ... }` når en tjeneste er nede. Det må behandles som feil. Tidligere ble det tolket som «ingen treff», og skredkortet viste grønt.
- NGUs WMS støtter ikke `INFO_FORMAT=application/json`, bare GML, HTML og ren tekst.
- WMS GetFeatureInfo med et grovt utsnitt gir naboflater som treff. `wmsFeatureInfoUrl` bruker 101×101 piksler over ±10 meter.
- Disse adressene var døde 2026-10-03: `openwms.statkart.no` og `arealplaner.kartverket.no` (domenene finnes ikke), `nve.geodataonline.no` (svarer ikke), `api.nve.no/hydrology/...` og `geo.ngu.no/mapserver/losmasse` og `.../berggrunn` (404), `gis3.nve.no/.../KastWMTS` (stoppet tjeneste) og `wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig` (500).
- Jordskredvarselet har fire nivåer (1 grønt til 4 rødt), og feltet heter `ActivityLevel`. Et varsel gjelder fra kl. 07 til kl. 07. Ukjent kommunenummer gir et grønt svar uten kommune.
- Arealer regnes i kommunens offisielle UTM-sone (32, 33 eller 35), se `utmEpsgForKommune`. I UTM33 ble arealet 0,6 % for stort for en eiendom i Bergen.
- Filene i arbeidsmappen har Windows-linjeskift (CRLF), bortsett fra denne filen og `.gitignore`.
- Railway bygger med Railpack, som forenkler `engines.node` til hovedversjonen. `>=22.0.0` gir nyeste Node 22.
- API-et sover når det ikke er i bruk (Serverless på Railway). Målt 2026-10-04 fra nettleser: det første kallet etter en pause tok 1,2 sekunder, mot 0,2 ellers. Fra en ekstern tjeneste ga det første kallet etter en pause 404 begge gangene det ble prøvd, og neste kall noen sekunder senere ga 200. Railway advarer selv om at det første kallet kan gi 502. Railways feilsvar har ikke CORS-headere, så i nettleseren blir det en avvist `fetch`. Demo-siden kaller derfor `/helse` når den lastes, og gjør inntil fire forsøk på et oppslag når svaret ikke er JSON eller `fetch` blir avvist. `admin/index.html` her gjør tilsvarende, men er ikke publisert (se Arkitektur): feiler innloggingen på admin-siden første gang, prøv igjen etter noen sekunder. Kunder som kaller API-et direkte, må selv prøve på nytt.
- In-memory-cachen tømmes hver gang containeren sovner eller deployes.
- «Deploy crashed»-e-post fra Railway ved hver deploy. Railway stopper den gamle deployen med SIGTERM og melder krasj hvis prosessen ikke avslutter med kode 0 eller 143. Med `npm run start` avslutter `npm` med kode 1 («npm error signal SIGTERM»). Med `node server.js` uten egen håndtering overser Node signalet, fordi den er hovedprosess i containeren, og blir tvangsavsluttet. Begge deler ble gjenskapt lokalt 2026-10-04. Løsningen er to ting sammen: Custom Start Command `node server.js` i Railway, og SIGTERM-håndteringen nederst i `server.js`, som avslutter med kode 0. `test/avslutning.test.js` tester det. Krasjmeldingene 2026-10-04 kom alle i det en aktiv deploy ble erstattet, ikke når tjenesten sovnet.
- En ny, tom database får nøklene fra `API_KEYS` lagt inn ved første oppstart. Volumet var tomt 2026-10-04, så det skjedde da.
- Skjermbilder og klikk i brukerens Chrome feiler når Chrome-vinduet er skjult eller minimert. Les da siden med JavaScript i stedet.
- Når en AI-økt skal styre GitHub Desktop, må både «GitHub Desktop» og prosessen `githubdesktop.exe` godkjennes. Vinduet eies av den siste.

## Videre plan

- **Steg 3 — Stripe:** kunder kjøper nøkler selv. Inntil da selges tilgang manuelt via admin-siden.
- **Grunnbok:** søknad til Kartverket om API-tilgang (gratis) med hjemmel i utleveringsforskriften § 4 fjerde ledd (berettiget interesse), uten fødselsnummer og D-nummer, for å få kjøpesum og kjøpsdato. Ikke startet, så vidt kjent. Søknadsskjema: kartverket.no/api-og-data/eiendomsdata/soknad-api-tilgang
