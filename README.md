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
http://localhost:3000/eiendom?adresse=Storgata+1&postnummer=0155&api_key=lokal-nokkel
```

## Deploy

- API: Railway, bygges fra repo-roten. Databasen må ligge på et volum, ellers slettes API-nøklene ved hver deploy.
- Demo-nettside: Netlify, publish directory `frontend`.
- Admin-side: Netlify, bygges fra repoet `Eidu-beep/igelkott`. Mappen `admin` her er en kopi.

Hver push til `main` deployer API-et og demo-nettsiden. Miljøvariabler og oppsett er beskrevet i `CLAUDE.md`.

## Endepunkter

| Metode | Sti | Beskrivelse |
|--------|-----|-------------|
| GET | `/helse` | Åpen helsesjekk |
| GET | `/eiendom?adresse=...` | Alle data for adressen. Krever header `X-Api-Key` |
| GET, POST, PATCH, DELETE | `/admin/...` | Administrasjon av nøkler. Krever header `X-Admin-Key` |

## Adresseoppslag

Adressen kontrolleres mot Kartverkets adresseregister (matrikkelen). API-et gjetter ikke: adressen må finnes nøyaktig slik den er skrevet, og bare ett sted. Store og små bokstaver og tegnsetting spiller ingen rolle.

| Parameter | Beskrivelse |
|-----------|-------------|
| `adresse` | Påkrevd, høyst 200 tegn. Adressen, med eller uten sted: `Storgata 1`, `Storgata 1, Oslo` eller `Storgata 1, 0155 Oslo` |
| `postnummer` | Valgfri, fire siffer. Avgrenser søket |
| `kommunenummer` | Valgfri, fire siffer. Avgrenser søket |

Samme adresse finnes ofte flere steder. «Storgata 1» finnes i over 40 kommuner, og i Vågan finnes den både i Svolvær og Kabelvåg. Send derfor postnummeret.

Står stedet i adressen, må det være postnummeret eller hele navnet på poststedet eller kommunen. «Storgata 1, Mo i Rana» og «Storgata 1, Rana» gir treff, «Storgata 1, Mo» gjør det ikke.

| Svar | Betyr |
|------|-------|
| 200 | Én adresse passet. `meta.adresse` er adressen slik den står i registeret |
| 400 med `kandidater` | Adressen finnes flere steder. `kandidater` har inntil ti av dem. `antall` sier hvor mange som finnes, når registeret har gitt alle |
| 400 uten `kandidater` | En parameter mangler eller er ugyldig. `feil` sier hvilken |
| 404 | Adressen finnes ikke slik den er skrevet. `kandidater` har adresser som ligner, når det finnes noen |

Hver kandidat har `adresse`, `postnummer`, `poststed`, `kommunenavn` og `kommunenummer`, og kan sendes inn igjen: `?adresse=Storgata+1&postnummer=8310&kommunenummer=1865`.

Til et søkefelt med forslag kan Kartverkets adresse-API kalles rett fra nettleseren, slik `frontend/index.html` gjør. Det er åpent og krever ingen nøkkel.

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
