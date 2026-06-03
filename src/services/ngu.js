import { hentJson, wmsFeatureInfoUrl } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

async function hentWmsLag(type, baseUrl, layer, lat, lon, parseProps) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache(type, nokkel);
  if (cachet) return cachet;

  const url = wmsFeatureInfoUrl(baseUrl, layer, lat, lon);
  try {
    const data = await hentJson(url);
    const p = data.features?.[0]?.properties ?? {};
    const resultat = parseProps(p, !!data.features?.length);
    settCache(type, nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, feil: true };
  }
}

export function hentLosmasse(lat, lon) {
  return hentWmsLag(
    'losmasse',
    'https://geo.ngu.no/mapserver/losmasse',
    'Losmasse',
    lat, lon,
    (p, funnet) => ({
      funnet,
      type:        p.LOSMASSE_T ?? p.losmasse_t ?? p.SYMBOL_T ?? null,
      marinGrense: p.HAVNIVAA ?? null,
      kornstorrelse: p.KORNST ?? null,
    }),
  );
}

export function hentBerggrunn(lat, lon) {
  return hentWmsLag(
    'berggrunn',
    'https://geo.ngu.no/mapserver/berggrunn',
    'BerggrunnsgeologiN250',
    lat, lon,
    (p, funnet) => ({
      funnet,
      bergart: p.BERGART ?? p.bergart ?? p.SYMBOL_T ?? null,
      alder:   p.ALDER   ?? null,
      genese:  p.GENINF  ?? null,
    }),
  );
}
