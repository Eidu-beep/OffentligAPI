# Eiendomsdata — teknisk spec

## Overordnet

Et tre-lags system for å hente, cache og servere norsk eiendomsdata fra offentlige kilder.

```
[Lag 1] Nettside (HTML/JS) — brukergrensesnitt
    ↕  HTTP/JSON
[Lag 2] API-server (Node.js/Express) — logikk, cache, proxy
    ↕  HTTP
[Lag 3] Offentlige kilder — Kartverket, NGU, NVE m.fl.
```

---

## Lag 2 — API-server

### Stack
- **Runtime:** Node.js 20+
- **Rammeverk:** Express 4
- **Cache:** node-cache (in-memory, ingen Redis-avhengighet til å begynne med)
- **HTTP-klient:** node-fetch (innebygd i Node 18+)
- **Deploy:** Railway (gratis tier = 512 MB RAM, 1 vCPU)

### Endepunkter

#### `GET /eiendom?adresse=<streng>`
Hoved-endepunktet. Tar en fritekst-adresse og returnerer alle tilgjengelige data.

**Parametere:**
| Parameter | Type | Påkrevd | Beskrivelse |
|-----------|------|---------|-------------|
| `adresse` | string | ja | F.eks. "Storgata 1, Oslo" |

**Respons 200:**
```json
{
  "meta": {
    "adresse": "Storgata 1",
    "poststed": "OSLO",
    "kommunenavn": "Oslo",
    "kommunenummer": "0301",
    "cachet": false,
    "hentetMs": 1240
  },
  "koordinater": {
    "lat": 59.91273,
    "lon": 10.74609,
    "utmNord": 6642389,
    "utmOst": 263145
  },
  "matrikkel": {
    "gardsnummer": 207,
    "bruksnummer": 462,
    "seksjonsnummer": null,
    "festenummer": null
  },
  "teig": {
    "funnet": true,
    "arealM2": 1240,
    "antallTeiger": 1
  },
  "reguleringsplan": {
    "funnet": false,
    "plannavn": null,
    "plantype": null,
    "planstatus": null,
    "lenke": "https://arealplaner.kartverket.no/?lat=59.91273&lon=10.74609&zoom=15"
  },
  "losmasser": {
    "funnet": true,
    "type": "Marine avsetninger",
    "marinGrense": null
  },
  "berggrunn": {
    "funnet": true,
    "bergart": "Larvikitt",
    "alder": "Perm"
  },
  "skredfare": {
    "funnet": false,
    "soner": []
  },
  "flomsone": {
    "funnet": false,
    "soner": []
  },
  "jordskredvarsel": {
    "aktsomhetsniva": 1,
    "tekst": "1 – Lav",
    "dato": "2026-06-03"
  }
}
```

**Respons 400:** `{ "feil": "Mangler adresse-parameter" }`
**Respons 404:** `{ "feil": "Ingen adressetreff", "sok": "..." }`
**Respons 502:** `{ "feil": "Oppslagsfeil", "detaljer": "..." }`

#### `GET /helse`
Helsesjekk for Railway. Returnerer `{ "ok": true, "tidspunkt": "..." }`.

#### `GET /cache/statistikk`
Viser cache-status: antall nøkler, treff-rate, størrelse.

---

### Cache-strategi

| Datakilde | TTL | Begrunnelse |
|-----------|-----|-------------|
| Adresse → koordinat | 7 dager | Adresser endres svært sjelden |
| Eiendomsteig | 7 dager | Grenser endres sjelden |
| Reguleringsplan | 24 timer | Kan vedtas nye planer |
| Løsmasser (NGU) | 30 dager | Geologiske data er stabile |
| Berggrunn (NGU) | 30 dager | Geologiske data er stabile |
| Skredfare (NVE) | 24 timer | Kan oppdateres |
| Flomsone (NVE) | 24 timer | Kan oppdateres |
| Jordskredvarsel | 1 time | Daglig varsel |

Cache-nøkkel: `<kilde>:<lat_rundet_4_desimaler>:<lon_rundet_4_desimaler>`
Adresse-nøkkel: `adresse:<normalisert_søkestreng>`

---

### Rate limiting

- **Per IP:** 60 kall/minutt
- **Globalt:** 500 kall/minutt
- **Overskridelse:** HTTP 429 med `Retry-After`-header

---

### Sikkerhet

- CORS: kun tillatte domener (konfigurerbart via `ALLOWED_ORIGINS` env-variabel)
- Helmet.js: sikre HTTP-headers
- Ingen API-nøkkel i første versjon (legges til ved behov)
- Alle utgående URL-er valideres mot allowlist

---

### Miljøvariabler

```env
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://din-nettside.netlify.app,http://localhost:5500
CACHE_MAX_KEYS=10000
LOG_LEVEL=info
```

---

## Lag 1 — Nettside

### Stack
- Ren HTML/CSS/JS — ingen byggeverktøy
- Deploy: Netlify (drag-and-drop)
- Kommuniserer kun med Lag 2 (aldri direkte med offentlige API-er)

### Konfigurasjon
```js
const API_URL = 'https://din-api.railway.app'; // byttes ut ved deploy
```

---

## Lag 3 — Offentlige datakilder

Alle kall skjer server-side fra Lag 2. Ingen direkte kall fra nettleseren.

| Kilde | URL | Protokoll |
|-------|-----|-----------|
| Kartverket adresse | ws.geonorge.no/adresser/v1/sok | REST/JSON |
| Geonorge WFS teig | wfs.geonorge.no/skwms1/wfs.eiendomskart_teig | WFS/GeoJSON |
| Kartverket reguleringsplaner | openwms.statkart.no/skwms1/wms.reguleringsplaner | WMS/JSON |
| NGU løsmasser | geo.ngu.no/mapserver/losmasse | WMS/JSON |
| NGU berggrunn | geo.ngu.no/mapserver/berggrunn | WMS/JSON |
| NVE skred/flom | gis3.nve.no/arcgis/rest/services/wmts/KastWMTS | ArcGIS REST |
| NVE jordskredvarsel | api.nve.no/hydrology/forecast/landslide/v1 | REST/JSON |

---

## Mappestruktur

```
eiendomsapi/
├── src/
│   ├── routes/
│   │   └── eiendom.js        # Hoved-endepunkt
│   ├── services/
│   │   ├── adresse.js        # Kartverket adresse-API
│   │   ├── teig.js           # Geonorge WFS
│   │   ├── plan.js           # Reguleringsplaner
│   │   ├── ngu.js            # NGU løsmasse + berggrunn
│   │   └── nve.js            # NVE skred + flom + varsel
│   ├── middleware/
│   │   └── rateLimiter.js    # Rate limiting
│   └── utils/
│       ├── cache.js          # Cache-wrapper
│       ├── geo.js            # Koordinatberegninger
│       └── wms.js            # WMS GetFeatureInfo-hjelper
├── frontend/
│   └── index.html            # Lag 1 — nettside
├── server.js                 # Inngangspunkt
├── package.json
├── .env.example
└── README.md
```

---

## Deploy-steg

### API (Railway)
1. Opprett konto på railway.app
2. "New Project" → "Deploy from GitHub repo" (eller "Empty project" + last opp manuelt)
3. Legg inn miljøvariabler under Settings → Variables
4. Railway tildeler automatisk en URL, f.eks. `eiendomsapi.up.railway.app`

### Nettside (Netlify)
1. Oppdater `API_URL` i `frontend/index.html` til Railway-URL-en
2. Dra `frontend/`-mappen til netlify.com/drop
