const TIMEOUT_MS = 8000;

const TILLATTE_DOMENER = [
  'ws.geonorge.no',
  'wfs.geonorge.no',
  'openwms.statkart.no',
  'geo.ngu.no',
  'gis3.nve.no',
  'api.nve.no',
];

function validerUrl(url) {
  const hostname = new URL(url).hostname;
  if (!TILLATTE_DOMENER.some(d => hostname === d || hostname.endsWith('.' + d))) {
    throw new Error(`Ikke tillatt domene: ${hostname}`);
  }
}

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

export function wmsFeatureInfoUrl(baseUrl, layer, lat, lon) {
  const d = 0.0003;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
    LAYERS: layer, QUERY_LAYERS: layer,
    BBOX: bbox, WIDTH: '5', HEIGHT: '5', X: '2', Y: '2',
    SRS: 'EPSG:4326', INFO_FORMAT: 'application/json', FEATURE_COUNT: '3',
  });
  return `${baseUrl}?${p}`;
}

export function arcgisIdentifyUrl(baseUrl, lat, lon) {
  const d = 0.01;
  const p = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326', layers: 'all', tolerance: '5',
    mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    imageDisplay: '100,100,96',
    returnGeometry: 'false', f: 'json',
  });
  return `${baseUrl}/identify?${p}`;
}
