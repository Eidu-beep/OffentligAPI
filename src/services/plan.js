import { hentJson, wmsFeatureInfoUrl } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

// Nasjonal base for reguleringsplaner (DiBK, «NAP»). Kommunene leverer planene sine hit,
// men ikke alle gjør det ennå – Oslo manglet for eksempel 2026-10-03. Ingen treff betyr derfor
// ikke nødvendigvis at eiendommen er uregulert.
// Lag: rpomrade_vn2 = planområde for reguleringsplaner på grunnen,
//      bebyggelseomrade_vn2 = planområde for bebyggelsesplaner på grunnen.
//
// VIKTIG: Dette datasettet er IKKE åpne data. I Geonorge er det merket «Norge digitalt begrenset»
// med Norge digitalt-lisens, i motsetning til de andre kildene (NLOD / CC BY 4.0). Oppslaget er
// derfor slått av som standard. Sett miljøvariabelen PLAN_AKTIV=true først når bruken er avklart.
const PLAN_URL = 'https://nap.ft.dibk.no/services/wms/reguleringsplaner/';
const LAG = ['rpomrade_vn2', 'bebyggelseomrade_vn2'];
const FELT = [
  'plannavn', 'plantype', 'planstatus', 'ikrafttredelsesdato',
  'arealplanId.planidentifikasjon', 'arealplanId.kommunenummer', 'link',
].join(',');

// SOSI-kodelister (register.geonorge.no/sosi-kodelister/plan/planregister)
const PLANTYPE = {
  20: 'Kommuneplanens arealdel',
  21: 'Kommunedelplan',
  22: 'Mindre endring av kommune(del)plan',
  30: 'Eldre reguleringsplan',
  31: 'Mindre reguleringsendring',
  32: 'Bebyggelsesplan ihht. reguleringsplan',
  33: 'Bebyggelsesplan ihht. kommuneplanens arealdel',
  34: 'Områderegulering',
  35: 'Detaljregulering',
};
const PLANSTATUS = {
  0: 'Planinitiativ',
  1: 'Planlegging igangsatt',
  2: 'Planforslag',
  3: 'Endelig vedtatt arealplan',
  4: 'Opphevet',
  5: 'Utgått/erstattet',
  6: 'Vedtatt plan med utsatt rettsvirkning',
  9: 'Avvist',
  10: 'Trukket/uaktuelt',
};

function planUt(p) {
  const dato = String(p.ikrafttredelsesdato ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const lenke = /^https?:\/\//i.test(p.link ?? '') ? p.link : null;
  return {
    plannavn: p.plannavn ?? null,
    planid: p['arealplanId.planidentifikasjon'] ?? null,
    plantype: PLANTYPE[p.plantype] ?? p.plantype ?? null,
    planstatus: PLANSTATUS[p.planstatus] ?? p.planstatus ?? null,
    ikrafttredelse: dato,
    kommune: p['arealplanId.kommunenummer'] ?? null,
    lenke,
  };
}

export function tolkPlan(data) {
  if (!Array.isArray(data?.features)) throw new Error('Uventet svar fra plantjenesten');

  // Samme plan kan komme flere ganger når den består av flere flater
  const sett = new Set();
  const planer = [];
  for (const f of data.features) {
    const plan = planUt(f.properties ?? {});
    const id = `${plan.kommune}|${plan.planid}|${plan.plannavn}`;
    if (sett.has(id)) continue;
    sett.add(id);
    planer.push(plan);
  }
  if (!planer.length) return { funnet: false, lenke: null, planer: [] };

  // Vedtatte planer først, deretter nyeste ikrafttredelse
  const vedtatt = p => (p.planstatus === PLANSTATUS[3] ? 0 : 1);
  planer.sort((a, b) =>
    vedtatt(a) - vedtatt(b) || String(b.ikrafttredelse ?? '').localeCompare(String(a.ikrafttredelse ?? '')));

  return { funnet: true, ...planer[0], antallPlaner: planer.length, planer };
}

function planAktiv() {
  return ['1', 'true', 'ja'].includes(String(process.env.PLAN_AKTIV ?? '').trim().toLowerCase());
}

export async function hentPlan(lat, lon) {
  if (!planAktiv()) return { funnet: false, lenke: null, utilgjengelig: true };

  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('plan', nokkel);
  if (cachet) return cachet;

  const url = wmsFeatureInfoUrl(PLAN_URL, LAG.join(','), lat, lon, {
    maksTreff: 10,
    // Uten denne følger hele planområdets geometri med i svaret (flere titalls kB per plan)
    ekstra: { propertyName: LAG.map(() => `(${FELT})`).join('') },
  });

  try {
    const resultat = tolkPlan(await hentJson(url));
    settCache('plan', nokkel, resultat);
    return resultat;
  } catch {
    return { funnet: false, lenke: null, feil: true };
  }
}
