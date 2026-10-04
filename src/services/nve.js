import { hentJson, hentArcgis, arcgisIdentifyUrl } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { koordinatNokkel } from '../utils/geo.js';

// NVEs karttjenester (ArcGIS REST). Tjeneste- og lagnavn er bekreftet med reelle kall 2026-10-03.
const NVE_KART = 'https://kart.nve.no/enterprise/rest/services';
const NVE_VARSEL = 'https://api01.nve.no/hydrology/forecast/landslide/v1.0.10/api/Warning/Municipality';

// En sone regnes som treff når den ligger på adressepunktet eller inntil så mange meter unna.
const TOLERANSE_M = 1;

function identify(tjeneste, lag, lat, lon) {
  return hentArcgis(arcgisIdentifyUrl(`${NVE_KART}/${tjeneste}/MapServer`, lat, lon, lag, TOLERANSE_M));
}

// Kjører flere oppslag parallelt. Gir { svar: { nøkkel: treff[] }, mangler: [navn på kilder som feilet] }.
async function hentFlere(kilder, lat, lon) {
  const nokler = Object.keys(kilder);
  const utfall = await Promise.allSettled(
    nokler.map(n => identify(kilder[n].tjeneste, kilder[n].lag, lat, lon)),
  );
  const svar = {};
  const mangler = [];
  utfall.forEach((u, i) => {
    if (u.status === 'fulfilled') svar[nokler[i]] = u.value;
    else mangler.push(kilder[nokler[i]].navn);
  });
  return { svar, mangler };
}

// ArcGIS identify skriver tomme verdier som teksten "Null"
function verdi(v) {
  return v === undefined || v === null || v === '' || v === 'Null' ? null : v;
}

// ── Skredfare ─────────────────────────────────────────────────────────
//
// Faresoner er detaljkartlagt bare i utvalgte områder. «Ingen faresone» betyr derfor bare
// «trygt» når punktet ligger i et kartlagt område (kartlagt = true). Utenfor kartlagte områder
// sier aktsomhetskartene (landsdekkende oversiktskart) om det kan være fare som må utredes.

const SKRED_KILDER = {
  faresoner:   { navn: 'Faresoner for skred i bratt terreng', tjeneste: 'Skredfaresoner3',          lag: 'all:0,6,7,8,28,29,30' },
  kvikkleire:  { navn: 'Kvikkleiresoner',                     tjeneste: 'SkredKvikkleire2',         lag: 'all:0' },
  snoskred:    { navn: 'Aktsomhetskart snøskred',             tjeneste: 'SnoskredAktsomhet',        lag: 'all:1,2,3' },
  steinsprang: { navn: 'Aktsomhetskart steinsprang',          tjeneste: 'SkredSteinAktR',           lag: 'all:1,2' },
  jordflom:    { navn: 'Aktsomhetskart jord- og flomskred',   tjeneste: 'JordFlomskredAktsomhet',   lag: 'all:1' },
  kvikkAkt:    { navn: 'Aktsomhetskart kvikkleireskred',      tjeneste: 'KvikkleireskredAktsomhet', lag: 'all:0' },
};

// Skredfaresoner3: lag 0 er kartlagt område. Lag 6–8 er samlet skredfare med hensyn til skog,
// lag 28–30 er samlet skredfare dersom skogen fjernes. Tallet er årlig sannsynlighet 1/n.
const FARESONE_LAG = { 6: 100, 7: 1000, 8: 5000 };
const FARESONE_LAG_UTEN_SKOG = { 28: 100, 29: 1000, 30: 5000 };

function faresone(type, n) {
  return { type, fareklasse: `Årlig sannsynlighet ≥ 1/${n}`, intervall: `${n} år` };
}

export function tolkSkredfare(svar) {
  const fare = svar.faresoner ?? [];
  const omrade = fare.find(r => r.layerId === 0);
  const rapportUrl = verdi(omrade?.attributes?.rapportURL);

  const soner = [];

  // Punktet ligger i alle soner fra den strengeste og utover. Vi oppgir den strengeste.
  const medSkog = fare.filter(r => r.layerId in FARESONE_LAG).map(r => FARESONE_LAG[r.layerId]);
  const utenSkog = fare.filter(r => r.layerId in FARESONE_LAG_UTEN_SKOG).map(r => FARESONE_LAG_UTEN_SKOG[r.layerId]);
  const verstMedSkog = medSkog.length ? Math.min(...medSkog) : null;
  const verstUtenSkog = utenSkog.length ? Math.min(...utenSkog) : null;
  if (verstMedSkog) soner.push(faresone('Skred i bratt terreng', verstMedSkog));
  if (verstUtenSkog && (!verstMedSkog || verstUtenSkog < verstMedSkog)) {
    soner.push(faresone('Skred i bratt terreng dersom skogen fjernes', verstUtenSkog));
  }

  for (const r of svar.kvikkleire ?? []) {
    const a = r.attributes ?? {};
    const navn = verdi(a.skrdOmrNvn);
    const faregrad = verdi(a.faregrad);
    soner.push({
      type: navn ? `Kvikkleiresone (${navn})` : 'Kvikkleiresone',
      fareklasse: [faregrad && `Faregrad ${String(faregrad).toLowerCase()}`, verdi(a.risiko)].filter(Boolean).join(', ') || null,
      intervall: null,
    });
  }

  const aktsomhet = [];
  if (svar.snoskred?.length) aktsomhet.push('Snøskred');
  if (svar.steinsprang?.length) aktsomhet.push('Steinsprang');
  if (svar.jordflom?.length) aktsomhet.push('Jord- og flomskred');
  if (svar.kvikkAkt?.length) aktsomhet.push('Kvikkleireskred');

  return {
    funnet: soner.length > 0,   // true = punktet ligger i en kartlagt faresone
    kartlagt: !!omrade,         // true = NVE har faresonekartlagt området (skred i bratt terreng)
    soner,
    aktsomhet,                  // aktsomhetsområder punktet ligger i
    rapport: /^https?:\/\//i.test(rapportUrl ?? '') ? rapportUrl : null,
  };
}

export async function hentSkredfare(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('skred', nokkel);
  if (cachet) return cachet;

  const { svar, mangler } = await hentFlere(SKRED_KILDER, lat, lon);

  // Uten faresonekartet vet vi ikke om punktet ligger i en faresone. Det er en feil, ikke «ingen treff».
  if (!svar.faresoner) return { funnet: false, soner: [], aktsomhet: [], feil: true };

  const resultat = tolkSkredfare(svar);
  if (mangler.length) return { ...resultat, ufullstendig: true, mangler };   // caches ikke
  settCache('skred', nokkel, resultat);
  return resultat;
}

// ── Flomsoner ─────────────────────────────────────────────────────────

const FLOM_KILDER = {
  flomsoner: { navn: 'Flomsoner',           tjeneste: 'Flomsoner2',    lag: 'all:0,13,14,15,16,17,18,19,20,21,22' },
  aktsomhet: { navn: 'Aktsomhetskart flom', tjeneste: 'Flomaktsomhet', lag: 'all:1,2' },
};

// Flomsoner2: lag 0 er kartlagt område. Lag 13–19 er flomsoner etter gjentaksintervall (år),
// lag 20–22 er de samme med klimapåslag.
const FLOMSONE_LAG = { 13: 10, 14: 20, 15: 50, 16: 100, 17: 200, 18: 500, 19: 1000 };
const FLOMSONE_LAG_KLIMA = { 20: 20, 21: 200, 22: 1000 };

function flomsoner(treff, lagTabell, klima) {
  return Object.entries(lagTabell)
    .map(([lagId, ar]) => ({ ar, flater: treff.filter(r => r.layerId === Number(lagId)) }))
    .filter(s => s.flater.length)
    .sort((a, b) => a.ar - b.ar)
    .map(s => ({
      navn: `${s.ar}-årsflom${klima ? ' med klimapåslag' : ''}`,
      intervall: `${s.ar} år`,
      // Lavpunkt: areal som ligger lavere enn flomvannstanden, men uten direkte forbindelse til elva
      lavpunkt: s.flater.every(r => String(r.attributes?.lavpunkt) === '1'),
      klima,
    }));
}

export function tolkFlomsone(svar) {
  const treff = svar.flomsoner ?? [];
  const akt = svar.aktsomhet ?? [];
  const soner = [...flomsoner(treff, FLOMSONE_LAG, false), ...flomsoner(treff, FLOMSONE_LAG_KLIMA, true)];
  return {
    funnet: soner.length > 0,                        // true = punktet ligger i en kartlagt flomsone
    kartlagt: treff.some(r => r.layerId === 0),      // true = NVE har flomsonekartlagt strekningen
    soner,
    aktsomhet: akt.some(r => r.layerId === 1),       // i aktsomhetsområde for flom (oversiktskart)
    aktsomhetDekning: akt.some(r => r.layerId === 2),
  };
}

export async function hentFlomsone(lat, lon) {
  const nokkel = koordinatNokkel(lat, lon);
  const cachet = hentCache('flom', nokkel);
  if (cachet) return cachet;

  const { svar, mangler } = await hentFlere(FLOM_KILDER, lat, lon);
  if (!svar.flomsoner) return { funnet: false, soner: [], feil: true };

  const resultat = tolkFlomsone(svar);
  if (mangler.length) return { ...resultat, ufullstendig: true, mangler };   // caches ikke
  settCache('flom', nokkel, resultat);
  return resultat;
}

// ── Jordskredvarsel ───────────────────────────────────────────────────
//
// NVE varsler jord- og flomskredfare per kommune på fire nivåer. Et varsel gjelder fra kl. 07
// til kl. 07 neste dag. Vi henter i går, i dag og i morgen, og plukker det som gjelder nå.

const NIVA_TEKST = { 1: '1 – Grønt', 2: '2 – Gult', 3: '3 – Oransje', 4: '4 – Rødt' };

// Norsk tid som { dato: 'YYYY-MM-DD', tidspunkt: 'YYYY-MM-DDTHH:mm:ss' }
export function norskTid(d = new Date()) {
  const deler = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(d).map(p => [p.type, p.value]),
  );
  const dato = `${deler.year}-${deler.month}-${deler.day}`;
  return { dato, tidspunkt: `${dato}T${deler.hour}:${deler.minute}:${deler.second}` };
}

function varselUt(v) {
  const niva = parseInt(v.ActivityLevel, 10) || 0;
  return {
    aktsomhetsniva: niva,
    tekst: NIVA_TEKST[niva] ?? `Nivå ${v.ActivityLevel}`,
    dato: String(v.ValidFrom ?? '').split('T')[0] || null,
    gyldigTil: v.ValidTo ?? null,
    hovedtekst: v.MainText || null,
    faretype: v.DangerTypeName || null,
  };
}

export function tolkJordskredvarsel(data, kommunenummer, tidspunktNa) {
  const ingen = { funnet: false, aktsomhetsniva: 0, tekst: 'Ikke tilgjengelig' };
  if (!Array.isArray(data)) return ingen;

  // API-et svarer med et tomt «grønt» varsel uten kommune når kommunenummeret er ukjent
  const knr = String(kommunenummer).padStart(4, '0');
  const varsler = data
    .filter(v => (v.MunicipalityList ?? []).some(m => String(m.Id).padStart(4, '0') === knr))
    .sort((a, b) => String(a.ValidFrom).localeCompare(String(b.ValidFrom)));
  if (!varsler.length) return ingen;

  const gjeldende =
    varsler.find(v => v.ValidFrom <= tidspunktNa && tidspunktNa <= v.ValidTo) ??
    varsler.filter(v => v.ValidFrom <= tidspunktNa).pop() ??
    varsler[0];
  const neste = varsler.find(v => v.ValidFrom > gjeldende.ValidFrom);

  return {
    funnet: true,
    ...varselUt(gjeldende),
    neste: neste ? varselUt(neste) : null,   // varselet for neste døgn, hvis det er publisert
    regionMatch: true,                       // varselet gjelder adressens kommune
  };
}

export async function hentJordskredvarsel(kommunenummer) {
  if (!kommunenummer) return { funnet: false, aktsomhetsniva: 0, tekst: 'Ikke tilgjengelig' };
  const knr = String(kommunenummer).padStart(4, '0');
  const cachet = hentCache('jordskred', knr);
  if (cachet) return cachet;

  try {
    const na = new Date();
    const dogn = 24 * 60 * 60 * 1000;
    const fra = norskTid(new Date(na.getTime() - dogn)).dato;
    const til = norskTid(new Date(na.getTime() + dogn)).dato;
    const data = await hentJson(`${NVE_VARSEL}/${knr}/1/${fra}/${til}`);

    const resultat = tolkJordskredvarsel(data, knr, norskTid(na).tidspunkt);
    if (resultat.funnet) settCache('jordskred', knr, resultat);
    return resultat;
  } catch {
    return { funnet: false, aktsomhetsniva: 0, tekst: 'Oppslagsfeil', feil: true };
  }
}
