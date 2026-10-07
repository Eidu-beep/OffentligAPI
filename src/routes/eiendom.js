import { Router } from 'express';
import { slaaOppAdresse } from '../services/adresse.js';
import { hentTeig } from '../services/teig.js';
import { hentPlan } from '../services/plan.js';
import { hentLosmasse, hentBerggrunn } from '../services/ngu.js';
import { hentSkredfare, hentFlomsone, hentJordskredvarsel } from '../services/nve.js';

const router = Router();

const FIRE_SIFFER = /^\d{4}$/;
const MAKS_ADRESSELENGDE = 200;

// Leser en parameter som tekst. Står samme parameter flere ganger i URL-en, gir Express en tabell.
// Det gir null her, og avvises av ruten.
function lesTekst(verdi) {
  if (verdi === undefined) return '';
  return typeof verdi === 'string' ? verdi.trim() : null;
}

async function eiendom(req, res) {
  const adresse = lesTekst(req.query.adresse);
  const kommunenummer = lesTekst(req.query.kommunenummer);
  const postnummer = lesTekst(req.query.postnummer);

  if (adresse === null || kommunenummer === null || postnummer === null) {
    return res.status(400).json({ feil: 'adresse, postnummer og kommunenummer kan bare oppgis én gang hver' });
  }
  if (!/[\p{L}\p{N}]/u.test(adresse)) {   // tom, eller bare tegn
    return res.status(400).json({ feil: 'Mangler adresse-parameter. Bruk ?adresse=Storgata+1&postnummer=0155' });
  }
  if (adresse.length > MAKS_ADRESSELENGDE) {
    return res.status(400).json({ feil: `adresse kan ha høyst ${MAKS_ADRESSELENGDE} tegn` });
  }
  if (postnummer && !FIRE_SIFFER.test(postnummer)) {
    return res.status(400).json({ feil: 'postnummer må være fire siffer, for eksempel 0155' });
  }
  if (kommunenummer && !FIRE_SIFFER.test(kommunenummer)) {
    return res.status(400).json({ feil: 'kommunenummer må være fire siffer, for eksempel 0301' });
  }

  const start = Date.now();

  let stedsdata;
  try {
    stedsdata = await slaaOppAdresse(adresse, { kommunenummer, postnummer });
  } catch (err) {
    // API-et gjetter ikke. Kandidatene er adressene som passer (400) eller ligner (404),
    // og kan sendes inn igjen med postnummer og kommunenummer.
    if (err.status === 400) {
      return res.status(400).json({
        feil: err.message,
        hjelp: 'Oppgi postnummer, enten i adressen (Storgata 1, 0155 Oslo) eller som egen parameter (&postnummer=0155). Kommunenummer kan også sendes (&kommunenummer=0301).',
        sok: err.sok,
        ...(err.antall === null ? {} : { antall: err.antall }),   // utelates når registeret har flere treff enn vi fikk
        kandidater: err.kandidater,
      });
    }
    if (err.status === 404) {
      return res.status(404).json({
        feil: 'Ingen adressetreff',
        sok: err.sok,
        ...(err.kandidater.length ? {
          hjelp: 'Adressen finnes ikke nøyaktig slik den er skrevet. Kandidatene er adresser som ligner.',
          kandidater: err.kandidater,
        } : {}),
      });
    }
    return res.status(502).json({ feil: 'Adresseoppslag feilet', detaljer: err.message });
  }

  const { lat, lon, kommunenummer: knr } = stedsdata;

  const [teig, plan, losmasse, berggrunn, skred, flom, jordskred] = await Promise.allSettled([
    hentTeig(lat, lon, {
      kommunenummer: knr,
      gardsnummer: stedsdata.gardsnummer,
      bruksnummer: stedsdata.bruksnummer,
      festenummer: stedsdata.festenummer,
    }),
    hentPlan(lat, lon),
    hentLosmasse(lat, lon),
    hentBerggrunn(lat, lon),
    hentSkredfare(lat, lon),
    hentFlomsone(lat, lon),
    hentJordskredvarsel(knr),
  ]).then(r => r.map(p => p.status === 'fulfilled' ? p.value : { funnet: false, feil: true }));

  const hentetMs = Date.now() - start;

  return res.json({
    meta: {
      adresse:         stedsdata.adresse,
      poststed:        stedsdata.poststed,
      postnummer:      stedsdata.postnummer,
      kommunenavn:     stedsdata.kommunenavn,
      kommunenummer:   stedsdata.kommunenummer,
      cachet:          stedsdata.cachet,
      hentetMs,
      kilder:          'Kartverket (CC BY 4.0), NGU og NVE (NLOD 2.0)',
    },
    koordinater: {
      lat:     stedsdata.lat,
      lon:     stedsdata.lon,
      utmNord: stedsdata.utmNord,
      utmOst:  stedsdata.utmOst,
    },
    matrikkel: {
      gardsnummer:     stedsdata.gardsnummer ?? teig?.gardsnummer ?? null,
      bruksnummer:     stedsdata.bruksnummer ?? teig?.bruksnummer ?? null,
      seksjonsnummer:  stedsdata.seksjonsnummer,
      festenummer:     stedsdata.festenummer,
      matrikkelnummer: teig?.matrikkelnummer ?? null,
    },
    teig,
    reguleringsplan: plan,
    losmasser:       losmasse,
    berggrunn,
    skredfare:       skred,
    flomsone:        flom,
    jordskredvarsel: jordskred,
  });
}

// Express 4 fanger ikke feil fra asynkrone ruter. Uten dette ville en uventet feil stoppet hele serveren.
router.get('/', (req, res, next) => { eiendom(req, res).catch(next); });

export default router;
