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

Adressen kontrolleres mot Kartverkets adresseregister (matrikkelen). API-et velger aldri mellom flere adresser: kan teksten være mer enn én adresse, svarer det med kandidatene. Store og små bokstaver og tegnsetting spiller ingen rolle.

| Parameter | Beskrivelse |
|-----------|-------------|
| `adresse` | Påkrevd, høyst 200 tegn. Adressen, med eller uten sted: `Storgata 1`, `Storgata 1, Oslo` eller `Storgata 1, 0155 Oslo` |
| `postnummer` | Valgfri, fire siffer. Avgrenser søket |
| `kommunenummer` | Valgfri, fire siffer. Avgrenser søket |

Samme adresse finnes ofte flere steder. «Storgata 1» finnes i over 40 kommuner, og i Vågan finnes den både i Svolvær og Kabelvåg. Send derfor postnummeret.

Står stedet i adressen, må det være postnummeret eller hele navnet på poststedet eller kommunen. «Storgata 1, Mo i Rana» og «Storgata 1, Rana» gir treff, «Storgata 1, Mo» gjør det ikke.

Adressen kan være skrevet litt annerledes enn i registeret. Den gir likevel treff når nøyaktig én adresse passer:

| Skrevet | Finner |
|---------|--------|
| `Storgaten 1, Oslo`, `Storgate 1, Oslo`, `Storgt. 1, Oslo` | Storgata 1, 0155 OSLO |
| `Kirkevegen 1, Oslo`, `Kirkevei 1, Oslo`, `Kirkevn. 1, Oslo`, `Kirkev. 1, Oslo` | Kirkeveien 1, 0266 OSLO |
| `Karl Johansgate 1, Oslo` | Karl Johans gate 1, 0154 OSLO |
| `Bygdoy alle 5, Oslo` | Bygdøy allé 5, 0257 OSLO |
| `Storgata 1, Tromso` eller `Tromsoe` | Storgata 1, 9008 TROMSØ |
| `Storgata 1 H0201, 0155 Oslo` | Storgata 1, 0155 OSLO (bolignummeret tas bort) |

Da er `meta.eksaktTreff` `false`, og `meta.adresse` viser adressen slik den står i registeret. Før en annen skrivemåte godtas, kontrolleres alle adressene med samme husnummer der stedet gjelder. Kan teksten være flere adresser, blir svaret 400 «Adressen kan være flere adresser» med kandidatene: «Storgate 10, Drammen» kan være Storgaten 10 i Svelvik, Øvre Storgate 10 og Nedre Storgate 10. Husnummer, bokstav og sted må alltid stemme, og skrivefeil i navnet gir bare forslag (404).

Uten sted i adressen, og uten `postnummer` eller `kommunenummer`, blir en annen skrivemåte bare et forslag (404), fordi adressen kan finnes et annet sted i landet. Send derfor alltid postnummeret.

| Svar | Betyr |
|------|-------|
| 200 | Én adresse passet. `meta.adresse` er adressen slik den står i registeret. `meta.eksaktTreff` er `false` når den var skrevet litt annerledes |
| 400 med `kandidater` | Adressen finnes flere steder, eller teksten kan være flere adresser (`feil` sier hvilket). `kandidater` har inntil ti av dem. `antall` sier hvor mange det er, når alle er funnet |
| 400 uten `kandidater` | En parameter mangler eller er ugyldig. `feil` sier hvilken |
| 404 | Ingen adresse passer, heller ikke skrevet på en annen måte. `kandidater` har adresser som ligner, når det finnes noen |

Hver kandidat har `adresse`, `postnummer`, `poststed`, `kommunenavn` og `kommunenummer`, og kan sendes inn igjen: `?adresse=Storgata+1&postnummer=8310&kommunenummer=1865`.

Til et søkefelt med forslag kan Kartverkets adresse-API kalles rett fra nettleseren, slik `frontend/index.html` gjør. Det er åpent og krever ingen nøkkel. Gir søket ingen treff, kan det gjentas med `fuzzy=true` (uten stjerne), som tåler skrivefeil.

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
