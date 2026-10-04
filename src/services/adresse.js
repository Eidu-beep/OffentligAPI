import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { wgs84TilUtm33 } from '../utils/geo.js';

const ADRESSE_URL = 'https://ws.geonorge.no/adresser/v1/sok';

// Deler «Storgata 12B, 0155 Oslo» i gatenavn, husnummer, bokstav, postnummer og sted.
// Husnummeret må sendes som et rent tall, ellers svarer Kartverket 400 («Not a valid integer»).
export function tolkSoketekst(tekst) {
  const m = tekst.match(/^(.+?)\s+(\d+)\s*([a-zæøå](?![a-zæøå]))?\s*,?\s*(.*)$/i);
  if (!m) return null;
  const rest = m[4].trim();
  const post = rest.match(/^(\d{4})(?!\d)\s*(.*)$/);
  const sted = (post ? post[2] : rest).replace(/\s+kommune$/i, '').trim();
  return {
    adressenavn: m[1].replace(/,$/, '').trim(),
    nummer: m[2],
    bokstav: m[3] ? m[3].toUpperCase() : null,
    postnummer: post ? post[1] : null,
    sted: sted || null,
  };
}

async function sok(parametre) {
  const data = await hentJson(`${ADRESSE_URL}?${new URLSearchParams({ treffPerSide: '5', ...parametre })}`);
  return data.adresser ?? [];
}

// Prøver fra det mest presise til det mest romslige søket, og stopper ved første treff
async function finnAdresser(tekst) {
  const d = tolkSoketekst(tekst);
  if (d) {
    const gate = { adressenavn: d.adressenavn, nummer: d.nummer, ...(d.bokstav ? { bokstav: d.bokstav } : {}) };
    let treff;
    if (d.postnummer) {
      treff = await sok({ ...gate, postnummer: d.postnummer });
    } else if (d.sted) {
      // Stedet kan være en kommune (Bergen) eller et poststed (Morvik)
      treff = await sok({ ...gate, kommunenavn: d.sted });
      if (!treff.length) treff = await sok({ ...gate, poststed: d.sted });
    } else {
      treff = await sok(gate);
    }
    if (treff.length) return treff;
  }
  return sok({ sok: tekst });   // fritekstsøk
}

export async function slaaOppAdresse(adresseStreng) {
  const normalisert = adresseStreng.trim().toLowerCase().replace(/\s+/g, ' ');
  const cachet = hentCache('adresse', normalisert);
  if (cachet) return { ...cachet, cachet: true };

  const adresser = await finnAdresser(normalisert);

  if (!adresser.length) {
    const feil = new Error('Ingen adressetreff');
    feil.status = 404;
    feil.sok = adresseStreng;
    throw feil;
  }

  const a = adresser[0];
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
