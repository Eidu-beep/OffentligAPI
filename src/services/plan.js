import { hentJson, wmsFeatureInfoUrl } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

export async function hentPlan(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('plan', nokkel);
  if (cachet) return cachet;

  const url = wmsFeatureInfoUrl(
    'https://openwms.statkart.no/skwms1/wms.reguleringsplaner',
    'Reguleringsplanomrader',
    lat, lon,
  );

  const lenke = `https://arealplaner.kartverket.no/?lat=${lat}&lon=${lon}&zoom=15`;

  try {
    const data = await hentJson(url);
    const p = data.features?.[0]?.properties ?? {};
    const funnet = !!data.features?.length;

    const resultat = {
      funnet,
      plannavn:   p.plannavn    ?? p.PLANNAVN    ?? null,
      plantype:   p.plantype    ?? p.PLANTYPE    ?? null,
      planstatus: p.planstatus  ?? p.PLANSTATUS  ?? null,
      kommune:    p.kommunenummer ?? p.KOMMUNENUMMER ?? null,
      lenke,
    };

    settCache('plan', nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, lenke, feil: true };
  }
}
