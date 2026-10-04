import { wgs84TilUtm33 } from './geo.js';

const TIMEOUT_MS = 8000;

// Kun disse vertene kan kalles. Bruker en ny kilde et nytt domene, må det legges til her.
const TILLATTE_DOMENER = [
  'ws.geonorge.no',   // Kartverket: adresse-API og eiendoms-API (teig)
  'geo.ngu.no',       // NGU: løsmasser og berggrunn (WMS)
  'kart.nve.no',      // NVE: faresoner, flomsoner og aktsomhetskart (ArcGIS REST)
  'api01.nve.no',     // NVE: jordskredvarsel
  'nap.ft.dibk.no',   // DiBK: nasjonal base for reguleringsplaner (WMS)
];

function validerUrl(url) {
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'https:') throw new Error(`Kun https er tillatt: ${url}`);
  if (!TILLATTE_DOMENER.some(d => hostname === d || hostname.endsWith('.' + d))) {
    throw new Error(`Ikke tillatt domene: ${hostname}`);
  }
}

// Henter en URL med tidsavbrudd. format = 'json' (standard) eller 'text'.
export async function hentJson(url, format = 'json') {
  validerUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'eiendomsapi/1.0', Accept: 'application/json, text/xml, */*' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} fra ${new URL(url).hostname}`);
    return format === 'text' ? await r.text() : await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export function hentTekst(url) {
  return hentJson(url, 'text');
}

// WMS GetFeatureInfo for ett punkt.
// Utsnittet er ±10 m fordelt på 101×101 piksler (ca. 0,2 m per piksel), slik at vi treffer
// flaten punktet faktisk ligger i, og ikke naboflater. Ikke alle tjenester støtter JSON:
// NGU svarer bare med GML (infoFormat = 'application/vnd.ogc.gml').
export function wmsFeatureInfoUrl(baseUrl, lag, lat, lon, { infoFormat = 'application/json', maksTreff = 5, ekstra = {} } = {}) {
  const halvM = 10;
  const px = 101;
  const midt = String((px - 1) / 2);
  const dLat = halvM / 111320;
  const dLon = halvM / (111320 * Math.cos(lat * Math.PI / 180));
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
    LAYERS: lag, QUERY_LAYERS: lag, STYLES: '',
    BBOX: `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`,
    WIDTH: String(px), HEIGHT: String(px), X: midt, Y: midt,
    SRS: 'EPSG:4326', INFO_FORMAT: infoFormat, FEATURE_COUNT: String(maksTreff),
    ...ekstra,
  });
  return `${baseUrl}?${p}`;
}

// ArcGIS REST identify for ett punkt.
// Vi spør i UTM33 med et utsnitt på ±50 m og 100×100 piksler. Da er 1 piksel = 1 meter,
// og toleransen (i piksler) blir det samme som antall meter rundt punktet.
export function arcgisIdentifyUrl(tjenesteUrl, lat, lon, lag = 'all', toleranseM = 1) {
  const { utmNord: y, utmOst: x } = wgs84TilUtm33(lat, lon);
  const d = 50;
  const p = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: 'esriGeometryPoint',
    sr: '25833',
    layers: lag,
    tolerance: String(toleranseM),
    mapExtent: `${x - d},${y - d},${x + d},${y + d}`,
    imageDisplay: '100,100,96',
    returnGeometry: 'false',
    f: 'json',
  });
  return `${tjenesteUrl}/identify?${p}`;
}

// ArcGIS svarer HTTP 200 også når noe er galt, med { error: {...} } i svaret.
// Det må behandles som feil – ellers ser en død tjeneste ut som «ingen treff».
export async function hentArcgis(url) {
  const data = await hentJson(url);
  if (data?.error) {
    throw new Error(`ArcGIS-feil ${data.error.code ?? ''}: ${data.error.message ?? 'ukjent feil'}`.trim());
  }
  if (!Array.isArray(data?.results)) throw new Error('Uventet svar fra ArcGIS (mangler results)');
  return data.results;
}
