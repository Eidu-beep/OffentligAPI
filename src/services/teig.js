import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel, polygonAreal, utmEpsgForKommune } from '../utils/geo.js';

// Kartverkets åpne eiendoms-API (JSON). Erstatter WFS-oppslaget, som tok «første teig i nærheten»
// og dermed kunne vise naboens tomt. Her slår vi opp teigene som hører til adressens
// matrikkelnummer. Bekreftet med reelle kall 2026-10-03.
const EIENDOM_URL = 'https://ws.geonorge.no/eiendom/v1';

// Kartverkets «trafikklys» for hvor nøyaktig teiggrensene er stedfestet
const NOYAKTIGHET = {
  Grønt: 'Grønt – ok',
  Gult: 'Gult – bør sjekkes',
  Rødt: 'Rødt – store mangler',
};

// Alle teiger som hører til matrikkelenheten
function matrikkelUrl({ kommunenummer, gardsnummer, bruksnummer, festenummer }, epsg) {
  const p = new URLSearchParams({
    kommunenummer: String(kommunenummer).padStart(4, '0'),
    gardsnummer: String(gardsnummer),
    bruksnummer: String(bruksnummer),
    omrade: 'true',
    utkoordsys: String(epsg),
  });
  if (festenummer > 0) p.set('festenummer', String(festenummer));
  return `${EIENDOM_URL}/geokoding?${p}`;
}

// Teiger på eller inntil 1 meter fra punktet (brukes når adressen mangler matrikkelnummer)
function punktUrl(lat, lon, epsg) {
  const p = new URLSearchParams({
    ost: String(lon), nord: String(lat), koordsys: '4258',
    radius: '1', utkoordsys: String(epsg), maksTreff: '5',
  });
  return `${EIENDOM_URL}/punkt/omrader?${p}`;
}

function erTeig(f) {
  return f?.properties?.objekttype === 'Teig' && !!f.geometry;
}

// Bygger svaret fra teigene til én matrikkelenhet
function teigUt(teiger) {
  if (!teiger.length) return { funnet: false, antallTeiger: 0 };

  const hoved = teiger.find(f => f.properties['hovedområde']) ?? teiger[0];
  const e = hoved.properties;
  const klasse = e['nøyaktighetsklasseteig'] ?? null;

  return {
    funnet: true,
    matrikkelnummer: e.matrikkelnummertekst ?? null,
    gardsnummer: e.gardsnummer ?? null,
    bruksnummer: e.bruksnummer ?? null,
    // Summen av alle teigene, beregnet fra teiggrensene i kommunens offisielle UTM-sone
    arealM2: Math.round(teiger.reduce((sum, f) => sum + polygonAreal(f.geometry), 0)),
    'nøyaktighet': NOYAKTIGHET[klasse] ?? klasse,
    fellesTeig: teiger.some(f => f.properties.teigmedflerematrikkelenheter === true),
    antallTeiger: teiger.length,
  };
}

function sjekkSvar(data) {
  if (!Array.isArray(data?.features)) throw new Error('Uventet svar fra eiendoms-API-et');
  return data.features.filter(erTeig);
}

// Svar på matrikkeloppslag: alle teigene hører til samme matrikkelenhet
export function tolkTeigerForMatrikkel(data) {
  return teigUt(sjekkSvar(data));
}

// Svar på punktoppslag: kan inneholde teiger fra flere eiendommer. Vi bruker bare den nærmeste.
export function tolkTeigVedPunkt(data) {
  const teiger = sjekkSvar(data)
    .sort((a, b) => (a.properties.meterFraPunkt ?? 0) - (b.properties.meterFraPunkt ?? 0));
  return teigUt(teiger.slice(0, 1));
}

export async function hentTeig(lat, lon, matrikkel = {}) {
  const { kommunenummer, gardsnummer, bruksnummer, festenummer } = matrikkel;
  const harMatrikkel = !!kommunenummer && gardsnummer > 0 && bruksnummer > 0;
  const nokkel = harMatrikkel
    ? `${kommunenummer}-${gardsnummer}/${bruksnummer}/${festenummer || 0}`
    : koordinatNokkel(lat, lon);
  const cachet = hentCache('teig', nokkel);
  if (cachet) return cachet;

  const epsg = utmEpsgForKommune(kommunenummer);
  try {
    let resultat = harMatrikkel
      ? tolkTeigerForMatrikkel(await hentJson(matrikkelUrl(matrikkel, epsg)))
      : { funnet: false, antallTeiger: 0 };
    if (!resultat.funnet) resultat = tolkTeigVedPunkt(await hentJson(punktUrl(lat, lon, epsg)));

    settCache('teig', nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, feil: true };
  }
}
