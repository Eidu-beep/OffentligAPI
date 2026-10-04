# Eiendomsdata API

API som samler norske eiendomsdata per adresse fra åpne offentlige kilder, og selger tilgang via API-nøkler.

**Gjeldende dokumentasjon ligger i `CLAUDE.md`.** `SPEC.md` og `STEG2.md` er eldre og delvis utdaterte.

## Kjøre lokalt

Krever Node 22 eller nyere.

```bash
npm install
npm test
```

Start serveren med testverdier (PowerShell):

```powershell
$env:ADMIN_KEY="lokal-admin"; $env:API_KEYS="lokal-nokkel:Test:0"; node server.js
```

Test at det virker:

```
http://localhost:3000/helse
http://localhost:3000/eiendom?adresse=Storgata+1,+Oslo&api_key=lokal-nokkel
```

## Deploy

- API: Railway, bygges fra repo-roten. Databasen må ligge på et volum, ellers slettes API-nøklene ved hver deploy.
- Demo-nettside: Netlify, publish directory `frontend`.
- Admin-side: Netlify, publish directory `admin`.

Hver push til `main` deployer alle tre. Miljøvariabler og oppsett er beskrevet i `CLAUDE.md`.

## Endepunkter

| Metode | Sti | Beskrivelse |
|--------|-----|-------------|
| GET | `/helse` | Åpen helsesjekk |
| GET | `/eiendom?adresse=...` | Alle data for adressen. Krever header `X-Api-Key` |
| GET, POST, PATCH, DELETE | `/admin/...` | Administrasjon av nøkler. Krever header `X-Admin-Key` |

## Datakilder

| Kilde | Data | Lisens |
|-------|------|--------|
| Kartverket, adresse-API | Adresse, koordinater, matrikkelnummer | CC BY 4.0 |
| Kartverket, eiendoms-API | Eiendomsteiger og areal | CC BY 4.0 |
| NGU, WMS | Løsmasser og berggrunn | NLOD 2.0 |
| NVE, karttjenester | Faresoner for skred, flomsoner og aktsomhetskart | NLOD 2.0 |
| NVE, varsling | Jordskredvarsel | NLOD 2.0 |
| DiBK, nasjonal planbase | Reguleringsplaner. Ikke åpne data, slått av som standard | Norge digitalt-lisens |

Kilde: Kartverket, NGU og NVE.
