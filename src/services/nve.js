import { hentJson, arcgisIdentifyUrl } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

const NVE_BASE = 'https://gis3.nve.no/arcgis/rest/services/wmts/KastWMTS/MapServer';

async function hentArcgisData(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachetNokkel = `nve_raw:${nokkel}`;
  const cachet = hentCache('skred', cachetNokkel);
  if (cachet) return cachet;

  const url = arcgisIdentifyUrl(NVE_BASE, lat, lon);
  const data = await hentJson(url);
  const resultater = data.results ?? [];
  settCache('skred', cachetNokkel, resultater);
  return resultater;
}

export async function hentSkredfare(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('skred', nokkel);
  if (cachet) return cachet;

  try {
    const resultater = await hentArcgisData(lat, lon);
    const soner = resultater
      .filter(r => /skred|snow|stein|jord/i.test(r.layerName ?? ''))
      .slice(0, 5)
      .map(r => ({
        type:        r.attributes?.skredtype ?? r.attributes?.skredfareType ?? r.layerName,
        fareklasse:  r.attributes?.fareklasse ?? null,
        intervall:   r.attributes?.gjentaksintervall ?? null,
      }));

    const resultat = { funnet: soner.length > 0, soner };
    settCache('skred', nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, soner: [], feil: true };
  }
}

export async function hentFlomsone(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('flom', nokkel);
  if (cachet) return cachet;

  try {
    const resultater = await hentArcgisData(lat, lon);
    const soner = resultater
      .filter(r => /flom|flood/i.test(r.layerName ?? ''))
      .slice(0, 3)
      .map(r => ({
        navn:       r.layerName,
        intervall:  r.attributes?.gjentaksintervall ?? null,
      }));

    const resultat = { funnet: soner.length > 0, soner };
    settCache('flom', nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, soner: [], feil: true };
  }
}

export async function hentJordskredvarsel(kommunenummer) {
  const cachet = hentCache('jordskred', kommunenummer ?? 'global');
  if (cachet) return cachet;

  try {
    const dato = new Date().toISOString().split('T')[0];
    const url = `https://api.nve.no/hydrology/forecast/landslide/v1/Simple/${dato}/${dato}`;
    const data = await hentJson(url);

    if (!Array.isArray(data) || !data.length) {
      return { funnet: false, aktsomhetsniva: 0, tekst: 'Ikke tilgjengelig', dato };
    }

    const kommuneStr = kommunenummer ? String(kommunenummer) : '';
    const fylke = kommuneStr.substring(0, 2);
    const match = data.find(v =>
      (v.MunicipalityId && String(v.MunicipalityId) === kommuneStr) ||
      (v.CountyId && String(v.CountyId) === fylke)
    ) ?? data[0];

    const niva = match.DangerLevel ?? match.dangerLevel ?? 0;
    const nivaTekst = ['Ikke definert', '1 – Lav', '2 – Moderat', '3 – Betydelig', '4 – Høy', '5 – Svært høy'][niva] ?? String(niva);

    const resultat = {
      funnet: true,
      aktsomhetsniva: niva,
      tekst: nivaTekst,
      dato: match.ValidFrom?.split('T')[0] ?? dato,
      regionMatch: !!(data.find(v =>
        (v.MunicipalityId && String(v.MunicipalityId) === kommuneStr) ||
        (v.CountyId && String(v.CountyId) === fylke)
      )),
    };

    settCache('jordskred', kommunenummer ?? 'global', resultat);
    return resultat;
  } catch {
    return { funnet: false, aktsomhetsniva: 0, tekst: 'Oppslagsfeil', feil: true };
  }
}
