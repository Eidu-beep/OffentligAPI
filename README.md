# Eiendomsdata API

Tre-lags system for norsk eiendomsdata fra åpne offentlige kilder.

## Kom i gang lokalt

```bash
# Installer avhengigheter
npm install

# Kopier miljøvariabler
cp .env.example .env

# Start i utviklingsmodus
npm run dev
```

Test at det virker:
```
http://localhost:3000/helse
http://localhost:3000/eiendom?adresse=Storgata+1,+Oslo
http://localhost:3000/cache/statistikk
```

---

## Deploy — Lag 2: API på Railway

1. Gå til [railway.app](https://railway.app) og opprett konto
2. Klikk **New Project** → **Empty Project**
3. Klikk **Add Service** → **GitHub Repo** (eller last opp manuelt)
4. Under **Settings → Variables**, legg inn:

```
NODE_ENV=production
ALLOWED_ORIGINS=https://din-nettside.netlify.app
CACHE_MAX_KEYS=10000
```

5. Railway setter PORT automatisk — ikke legg inn PORT manuelt
6. Etter deploy: kopier URL-en Railway gir deg (f.eks. `eiendomsapi.up.railway.app`)

---

## Deploy — Lag 1: Nettside på Netlify

1. Åpne `frontend/index.html`
2. Bytt ut linjen:
   ```js
   const API_URL = 'https://din-api.railway.app';
   ```
   med din Railway-URL
3. Gå til [netlify.com/drop](https://app.netlify.com/drop)
4. Dra `frontend/`-mappen inn i nettleseren
5. Netlify gir deg en URL — kopier den tilbake til Railway som `ALLOWED_ORIGINS`

---

## API-referanse

### `GET /eiendom?adresse=<streng>`
Returnerer alle tilgjengelige data for adressen.

### `GET /helse`
Helsesjekk. Returnerer `{ "ok": true }`.

### `GET /cache/statistikk`
Cache-status: antall nøkler, treff-rate.

---

## Datakilder

| Kilde | Data | Tilgang |
|-------|------|---------|
| Kartverket adresse-API | Koordinater, matrikkel | Åpent |
| Geonorge WFS | Eiendomsteig, grenser | Åpent |
| Kartverket WMS | Reguleringsplaner | Åpent |
| NGU WMS | Løsmasser, berggrunn | Åpent |
| NVE ArcGIS REST | Skredfare, flomsoner | Åpent |
| NVE REST | Jordskredvarsel | Åpent |

Alle data lisensiert under NLOD 2.0.
