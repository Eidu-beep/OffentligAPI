import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel, wgs84TilUtm33 } from '../utils/geo.js';

// Henter teig (eiendomsgrense + areal) fra Geonorge WFS.
// Tjenesten leverer XML/GML, så vi henter rå tekst og plukker ut feltene vi trenger.
// Vi spør i UTM33 (EPSG:25833) som er det WFS-et jobber internt i — unngår akse-forvirring.

function plukk(xml, tag) {
  // Henter innholdet i <app:tag>...</app:tag> (første treff)
  const m = xml.match(new RegExp(`<app:${tag}>([^<]*)</app:${tag}>`));
  return m ? m[1].trim() : null;
}

function tellMembers(xml) {
  return (xml.match(/<wfs:member>/g) || []).length;
}

export async function hentTeig(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('teig', nokkel);
  if (cachet) return cachet;

  // Konverter til UTM33 og lag en liten bbox (±40 m) rundt punktet
  const { utmNord, utmOst } = wgs84TilUtm33(lat, lon);
  const d = 40;
  const bbox = `${utmOst - d},${utmNord - d},${utmOst + d},${utmNord + d}`;
  const url = `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig`
    + `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=app:Teig`
    + `&COUNT=5&BBOX=${bbox},urn:ogc:def:crs:EPSG::25833`;

  try {
    const xml = await hentJson(url, 'text'); // hent som rå tekst, ikke JSON
    const antall = tellMembers(xml);

    if (antall === 0) {
      const tomt = { funnet: false, antallTeiger: 0 };
      settCache('teig', nokkel, tomt);
      return tomt;
    }

    // Isoler første teig før vi plukker felter (unngår sammenblanding ved flere treff)
    const førsteMember = xml.split('<wfs:member>')[1]?.split('</wfs:member>')[0] ?? xml;

    // Plukk ut feltene fra første teig
    const arealStr = plukk(førsteMember, 'lagretBeregnetAreal');
    const resultat = {
      funnet: true,
      matrikkelnummer: plukk(førsteMember, 'matrikkelnummerTekst'),
      gardsnummer: plukk(førsteMember, 'gardsnummer'),
      bruksnummer: plukk(førsteMember, 'bruksnummer'),
      arealM2: arealStr ? Math.round(parseFloat(arealStr)) : null,
      nøyaktighet: plukk(førsteMember, 'noyaktighetsklasseTeig'),
      fellesTeig: plukk(førsteMember, 'teigMedFlereMatrikkelenheter') === 'true',
      antallTeiger: antall,
    };

    settCache('teig', nokkel, resultat);
    return resultat;
  } catch (e) {
    return { funnet: false, feil: true, melding: e.message };
  }
}
