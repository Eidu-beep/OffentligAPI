import { hentTekst, wmsFeatureInfoUrl } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

// NGUs WMS-tjenester støtter ikke JSON i GetFeatureInfo, bare GML, HTML og ren tekst.
// Tjeneste- og lagnavn er bekreftet med GetCapabilities og reelle kall 2026-10-03.
const LOSMASSE_URL = 'https://geo.ngu.no/mapserver/LosmasserWMS2';
const BERGGRUNN_URL = 'https://geo.ngu.no/mapserver/BerggrunnWMS3';
const GML = 'application/vnd.ogc.gml';

function dekod(tekst) {
  return tekst
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Deler et GML-svar fra MapServer i objekter: <Lagnavn_feature> ... </Lagnavn_feature>
export function gmlObjekter(xml) {
  if (!/<msGMLOutput[\s>]/.test(xml)) {
    throw new Error('Uventet svar fra NGU (ikke GML)');
  }
  return [...xml.matchAll(/<([A-Za-z0-9_]+)_feature>([\s\S]*?)<\/\1_feature>/g)]
    .map(m => ({ lag: m[1], xml: m[2] }));
}

// Henter teksten i <tag>...</tag>. Tomme felt gir null.
export function gmlFelt(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  const tekst = m ? dekod(m[1]).replace(/\s+/g, ' ').trim() : '';
  return tekst || null;
}

async function hentGml(type, url, lat, lon, tolk) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache(type, nokkel);
  if (cachet) return cachet;

  try {
    const resultat = tolk(gmlObjekter(await hentTekst(url)));
    settCache(type, nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, feil: true };
  }
}

// ── Løsmasser ─────────────────────────────────────────────────────────

export function tolkLosmasse(objekter) {
  const o = objekter[0];
  if (!o) return { funnet: false };
  const kode = gmlFelt(o.xml, 'losmassetype');
  return {
    funnet: true,
    type: gmlFelt(o.xml, 'losmassetype_tekst'),
    kode: kode ? Number(kode) : null,
    beskrivelse: gmlFelt(o.xml, 'losmassetype_definisjon'),
    malestokk: gmlFelt(o.xml, 'egnetmaalestokk_formattert'),
  };
}

export function hentLosmasse(lat, lon) {
  const url = wmsFeatureInfoUrl(LOSMASSE_URL, 'Losmasse_flate', lat, lon, { infoFormat: GML, maksTreff: 1 });
  return hentGml('losmasse', url, lat, lon, tolkLosmasse);
}

// ── Berggrunn ─────────────────────────────────────────────────────────

// Regionalt nivå (1:250 000) er mest detaljert. Der det mangler, bruker vi nasjonalt nivå (1:1 350 000).
export function tolkBerggrunn(objekter) {
  const o = objekter.find(x => /regional/i.test(x.lag)) ?? objekter.find(x => /nasjonal/i.test(x.lag));
  if (!o) return { funnet: false };

  const fra = gmlFelt(o.xml, 'dannelsesmaksalder_tekst');
  const til = gmlFelt(o.xml, 'dannelsesminalder_tekst');
  const alder =
    gmlFelt(o.xml, 'dannelsesalder_visning_tekst') ??
    gmlFelt(o.xml, 'dannelsesalder_tekst') ??
    (fra && til && fra !== til ? `Fra ${fra} til ${til}` : fra ?? til);

  return {
    funnet: true,
    bergart: gmlFelt(o.xml, 'hovedbergart_tekst'),
    bergartsenhet: gmlFelt(o.xml, 'bergartsenhet_tekst'),
    tilleggsbergarter: ['tilleggsbergart1_tekst', 'tilleggsbergart2_tekst', 'tilleggsbergart3_tekst']
      .map(t => gmlFelt(o.xml, t)).filter(Boolean),
    alder: alder ?? null,
    tektoniskEnhet: gmlFelt(o.xml, 'tektoniskenhet_tekst'),
    datagrunnlag: gmlFelt(o.xml, 'berggrunn_datatype_tekst'),
  };
}

export function hentBerggrunn(lat, lon) {
  const lag = 'Berggrunn_regional_hovedbergarter,Berggrunn_nasjonal_hovedbergarter';
  const url = wmsFeatureInfoUrl(BERGGRUNN_URL, lag, lat, lon, { infoFormat: GML, maksTreff: 1 });
  return hentGml('berggrunn', url, lat, lon, tolkBerggrunn);
}
