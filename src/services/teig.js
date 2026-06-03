import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

export async function hentTeig(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('teig', nokkel);
  if (cachet) return cachet;

  const d = 0.002;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const url = `https://wfs.geonorge.no/skwms1/wfs.eiendomskart_teig?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=app:Teig&BBOX=${bbox},urn:ogc:def:crs:EPSG::4326&COUNT=5&outputFormat=application/json`;

  try {
    const data = await hentJson(url);
    const features = data.features ?? [];
    const f = features[0]?.properties ?? {};

    const resultat = {
      funnet: features.length > 0,
      arealM2: f.areal_m2 ? Math.round(f.areal_m2) : null,
      arealmerknad: f.arealmerknad ?? null,
      fellesTeig: f.teigmedflerematrikkelenheter ?? false,
      antallTeiger: features.length,
    };

    settCache('teig', nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, feil: true };
  }
}
