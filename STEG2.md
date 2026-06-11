# Steg 2 — Database og admin-side

## Hva som er nytt

- `src/db.js` — SQLite-database for nøkler og bruksstatistikk
- `src/middleware/apiNøkkel.js` — bruker nå databasen i stedet for env
- `src/routes/admin.js` — full CRUD: opprett, list, deaktiver, slett nøkler
- `admin/index.html` — nettside for å administrere nøkler visuelt

## VIKTIG: Persistent volum på Railway

SQLite lagrer data i en fil. Uten et persistent volum slettes filen hver gang
Railway deployer på nytt. Slik setter du det opp:

1. Gå til Railway-prosjektet → klikk på tjenesten
2. Klikk **Settings** → scroll til **Volumes**
3. Klikk **New Volume**
4. Sett **Mount path** til: `/data`
5. Lagre

Legg deretter til miljøvariabelen:

```
DB_PATH=/data/eiendom.db
```

Nå overlever databasen alle deploys.

## Miljøvariabler (oppdatert liste)

```
NODE_ENV=production
ALLOWED_ORIGINS=https://din-hovednettside.no,https://din-admin-side.netlify.app
CACHE_MAX_KEYS=10000
DB_PATH=/data/eiendom.db
ADMIN_KEY=<noe-langt-og-hemmelig>
```

`API_KEYS` kan nå stå tom — du oppretter nøkler via admin-siden i stedet.
Hvis du har gamle nøkler i `API_KEYS`, migreres de automatisk til databasen
første gang serveren starter med tom database.

## Admin-siden

1. Åpne `admin/index.html`, bytt `API_URL` til din Railway-URL
2. Last opp til Netlify (egen side, eller en undermappe)
3. Åpne siden, logg inn med `ADMIN_KEY`
4. Opprett nøkler, kopier dem, send til kunder

**Tips:** Hold admin-siden privat. Den er beskyttet av ADMIN_KEY, men ikke del
URL-en offentlig.

## Admin-API (hvis du vil bruke det direkte)

Alle krever header `X-Admin-Key: <ADMIN_KEY>`.

| Metode | Sti | Beskrivelse |
|--------|-----|-------------|
| GET | `/admin/status` | Serverstatus + cache |
| GET | `/admin/nøkler` | List alle nøkler |
| POST | `/admin/nøkler` | Opprett `{kundenavn, epost, dagligGrense}` |
| PATCH | `/admin/nøkler/:nøkkel/aktiv` | `{aktiv: true/false}` |
| PATCH | `/admin/nøkler/:nøkkel/grense` | `{dagligGrense: N}` |
| DELETE | `/admin/nøkler/:nøkkel` | Slett nøkkel |
| GET | `/admin/nøkler/:nøkkel/historikk` | Bruk siste 30 dager |
