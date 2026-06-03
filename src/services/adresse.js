import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { wgs84TilUtm33 } from '../utils/geo.js';

export async function slaaOppAdresse(adresseStreng) {
  const normalisert = adresseStreng.trim().toLowerCase().replace(/\s+/g, ' ');
  const cachet = hentCache('adresse', normalisert);
  if (cachet) return { ...cachet, cachet: true };

  const deler = normalisert.match(/^(.+?)\s+(\d+\s*[a-z]?)\s*,?\s*(.*)$/);
  const params = new URLSearchParams({ treffPerSide: '5' });

  if (deler) {
    params.set('adressenavn', deler[1]);
    params.set('nummer', deler[2].trim());
    if (deler[3]) params.set('kommunenavn', deler[3]);
  } else {
    params.set('adressenavn', normalisert);
  }

  const url = `https://ws.geonorge.no/adresser/v1/sok?${params}`;
  const data = await hentJson(url);

  if (!data.adresser?.length) {
    const feil = new Error('Ingen adressetreff');
    feil.status = 404;
    feil.sok = adresseStreng;
    throw feil;
  }

  const a = data.adresser[0];
  const lat = a.representasjonspunkt.lat;
  const lon = a.representasjonspunkt.lon;
  const utm = wgs84TilUtm33(lat, lon);

  const resultat = {
    adresse: `${a.adressenavn} ${a.nummer}${a.bokstav || ''}`,
    poststed: a.poststed,
    postnummer: a.postnummer,
    kommunenavn: a.kommunenavn,
    kommunenummer: a.kommunenummer,
    lat,
    lon,
    utmNord: utm.utmNord,
    utmOst: utm.utmOst,
    gardsnummer: a.gardsnummer,
    bruksnummer: a.bruksnummer,
    seksjonsnummer: a.seksjonsnummer ?? null,
    festenummer: a.festenummer ?? null,
    cachet: false,
  };

  settCache('adresse', normalisert, resultat);
  return resultat;
}
