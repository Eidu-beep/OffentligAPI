import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { wgs84TilUtm33 } from '../utils/geo.js';

// Kartverkets adresse-API søker i matrikkelens adresser, som er det offisielle adresseregisteret.
const ADRESSE_URL = 'https://ws.geonorge.no/adresser/v1/sok';
// Søk på gate og husnummer henter det meste API-et gir i ett svar. Finnes det enda flere treff, kan vi ikke
// vite at adressen er entydig. Fritekstsøk gir mange løse treff, og der holder de hundre første.
const TREFF_PER_SOK = 1000;
const TREFF_PER_FRITEKSTSOK = 100;
const MAKS_KANDIDATER = 10;
// Feltene vi bruker. Uten denne listen sender API-et alt det har om hver adresse.
const FELT = ['adressetekst', 'adressetekstutenadressetilleggsnavn', 'nummer', 'postnummer', 'poststed', 'kommunenummer',
  'kommunenavn', 'gardsnummer', 'bruksnummer', 'festenummer', 'representasjonspunkt']
  .map(felt => 'adresser.' + felt).join(',') + ',metadata.totaltAntallTreff';
// Ord som kan stå i en adresse uten å bety noe for oppslaget: «Storgata 1 i Oslo kommune, Norge»
const OVERFLODIGE_ORD = new Set(['i', 'kommune', 'norge', 'norway']);
const TALL_OG_BOKSTAV = /(\d)\s+([a-hj-zæøå])(?![\p{L}\p{N}])/gu;   // «12 b» er det samme som «12b»
const TALL_OG_I = /(\d)\s+i(?![\p{L}\p{N}])/gu;                       // «4 i» kan være husbokstaven I

function utenPunktum(o) {
  let fra = 0;
  let til = o.length;
  while (fra < til && o[fra] === '.') fra++;
  while (til > fra && o[til - 1] === '.') til--;
  return o.slice(fra, til);
}

const forenkle = tekst => String(tekst ?? '').normalize('NFC').toLowerCase();

// Deler en tekst i ord som kan sammenlignes: «Storgata 12 B, 0155 Oslo» blir storgata, 12b, 0155, oslo.
// Store og små bokstaver, komma, bindestrek og punktum først og sist i et ord spiller ingen rolle.
export function ord(tekst) {
  return forenkle(tekst)
    .replace(TALL_OG_BOKSTAV, '$1$2')
    .split(/[\s,;()\-–—]+/)
    .map(utenPunktum)
    .filter(Boolean);
}

// «Myrveien 4 i Bergen» kan bety husnummer 4 i Bergen, eller husnummer 4I. Begge lesemåtene prøves,
// og finnes begge adressene, er teksten ikke entydig.
export function lesemaater(tekst) {
  const enkel = forenkle(tekst);
  const medI = enkel.replace(TALL_OG_I, '$1i');
  return medI === enkel ? [ord(enkel)] : [ord(enkel), ord(medI)];
}

// Deler «Storgata 12B, 0155 Oslo» i gatenavn, husnummer, bokstav og ordene som sier hvor adressen er.
// Gir null når teksten ikke er gate og husnummer, for eksempel matrikkeladressen «Flaga, 12/5».
// Husnummeret har høyst fem siffer. Registeret svarer med feil på tall det ikke kan lese.
export function tolkSoketekst(tekst) {
  const m = tekst.match(/^(.+?)\s+(\d{1,5})(?:\s*([a-hj-zæøå])|(i))?(?![a-zæøå0-9])\s*,?\s*(.*)$/i);
  if (!m || m[5].startsWith('/')) return null;
  // «Torvet, Storgata 8A»: det som står foran kommaet er et tilleggsnavn, ikke en del av gatenavnet
  const adressenavn = m[1].replace(/,$/, '').split(',').pop().trim();
  if (!/\p{L}/u.test(adressenavn)) return null;   // «12/5 5708» er gårds- og bruksnummer med postnummer, ikke gate 12/5
  const bokstav = m[3] ?? m[4];
  return {
    adressenavn,
    nummer: m[2],
    bokstav: bokstav ? bokstav.toUpperCase() : null,
    uklarI: !bokstav && /^i(?![\p{L}\p{N}])/iu.test(m[5]),   // «4 i Bergen»: i-en kan være husbokstaven
    stedsord: ord(m[5]).filter(o => !OVERFLODIGE_ORD.has(o)),
  };
}

const adressetekster = a => [a.adressetekst, a.adressetekstutenadressetilleggsnavn].map(ord).filter(adr => adr.length);
const stedsordFor = a => new Set([a.postnummer, a.poststed, a.kommunenavn].flatMap(ord));
const begynnerMed = (sokeord, adr) => adr.length <= sokeord.length && adr.every((o, i) => o === sokeord[i]);

// Sant når ordene er adressens eget postnummer, poststed eller kommunenavn: hele navn, i hvilken som helst
// rekkefølge. «Kristiansund» passer for poststedet KRISTIANSUND N fordi kommunen heter det, men «Mo» er ikke
// nok for MO I RANA.
function erStedetTil(a, rest) {
  const navn = [a.postnummer, a.poststed, a.kommunenavn].map(ord).filter(n => n.length);
  const sjekk = (pos, brukt) => {
    if (pos === rest.length) return true;
    if (navn.some((n, i) => !brukt.includes(i) && n.every((o, j) => rest[pos + j] === o) && sjekk(pos + n.length, [...brukt, i]))) return true;
    return OVERFLODIGE_ORD.has(rest[pos]) && sjekk(pos + 1, brukt);
  };
  return sjekk(0, []);
}

// Sant når søketeksten er nøyaktig denne adressen, eventuelt fulgt av adressens eget postnummer, poststed
// eller kommunenavn. Kartverkets søk er romslig: «storgata» treffer også «Nedre Storgate», og et husnummer
// kan treffe andre tall i adressen. Derfor kontrolleres hvert treff her.
export function passer(a, lesninger) {
  return lesninger.some(sokeord => adressetekster(a).some(adr =>
    begynnerMed(sokeord, adr) && erStedetTil(a, sokeord.slice(adr.length))));
}

// Adresser som ligner på søket, til forslag når ingen adresse passer nøyaktig:
// samme husnummer, og enten samme sted eller samme adressetekst
function ligner(a, d, lesninger) {
  if (!d) return true;
  if (String(a.nummer) !== d.nummer) return false;
  const steder = stedsordFor(a);
  return d.stedsord.every(o => steder.has(o))
    || lesninger.some(sokeord => adressetekster(a).some(adr => begynnerMed(sokeord, adr)));
}

function unike(adresser) {
  const sett = new Map();
  for (const a of adresser) {
    const nokkel = `${a.kommunenummer}|${a.postnummer}|${ord(a.adressetekst).join(' ')}`;
    if (!sett.has(nokkel)) sett.set(nokkel, a);
  }
  return [...sett.values()];
}

async function sok(parametre, antall = TREFF_PER_SOK) {
  const data = await hentJson(`${ADRESSE_URL}?${new URLSearchParams({ treffPerSide: String(antall), filtrer: FELT, ...parametre })}`);
  const adresser = data.adresser ?? [];
  const totalt = data.metadata?.totaltAntallTreff;
  // flere = registeret har flere treff enn vi fikk. Mangler tallet, regnes en full side som «flere».
  return { adresser, flere: typeof totalt === 'number' ? totalt > adresser.length : adresser.length >= antall };
}

// Henter adresser fra registeret og deler dem i de som passer nøyaktig, og de som bare ligner
async function finnAdresser(tekst, filter) {
  const lesninger = lesemaater(tekst);
  const d = tolkSoketekst(tekst);
  const fast = {
    ...(filter.kommunenummer ? { kommunenummer: filter.kommunenummer } : {}),
    ...(filter.postnummer ? { postnummer: filter.postnummer } : {}),
  };
  // Fritekst til Kartverket: komma blir mellomrom og fyllord tas bort. Ellers som skrevet, for «St.Croix gate»
  // er ett ord der. Søket krever at alle ordene finnes, så tegn som står alene må også bort.
  const fritekst = tekst.replace(TALL_OG_BOKSTAV, '$1$2').split(/[\s,;()]+/)
    .filter(o => /[\p{L}\p{N}]/u.test(o) && !OVERFLODIGE_ORD.has(utenPunktum(o))).join(' ');
  // En adresse har et navn, eller gårds- og bruksnummer («12/5»). Bare tall og fyllord er ingenting å søke på.
  if (!/\p{L}|\d\/\d/u.test(fritekst)) return { treff: [], flere: false, lignende: [] };

  // 1. Det mest presise søket. Gate og husnummer søkes felt for felt i hele landet, slik at husnummeret må
  //    være husnummeret, og stedet kontrolleres her etterpå. Tom bokstav betyr «nummeret uten bokstav».
  //    Annen tekst (matrikkeladresser, og adresser uten husnummer) søkes som fritekst og som adressetekst.
  const svar = await Promise.all(d
    ? [sok({ adressenavn: d.adressenavn, nummer: d.nummer, ...(d.uklarI ? {} : { bokstav: d.bokstav ?? '' }), ...fast })]
    : [sok({ sok: fritekst, ...fast }, TREFF_PER_FRITEKSTSOK), sok({ adressetekst: tekst, ...fast }, TREFF_PER_FRITEKSTSOK)]);
  const funnet = unike(svar.flatMap(s => s.adresser));
  let flere = svar.some(s => s.flere);
  let treff = funnet.filter(a => passer(a, lesninger));

  // 2. Ingen passet. Prøv fritekst (teksten kan være delt feil i gate og nummer), og hent adresser med
  //    nesten samme skrivemåte til forslag.
  let vanlige = d ? [] : funnet;
  let uklare = [];
  if (!treff.length && d) {
    const [vanlig, uklart] = await Promise.all([
      sok({ sok: fritekst, ...fast }, TREFF_PER_FRITEKSTSOK),
      sok({ sok: fritekst, fuzzy: 'true', ...fast }, TREFF_PER_FRITEKSTSOK).catch(() => ({ adresser: [] })),
    ]);
    vanlige = unike(vanlig.adresser);
    treff = vanlige.filter(a => passer(a, lesninger));
    flere = vanlig.flere;
    uklare = unike(uklart.adresser);
  }

  // 3. Søket ga flere treff enn vi fikk, og bare én adresse passet. Kontroller mot adresseteksten at den
  //    virkelig er den eneste, i stedet for å melde at adressen finnes flere steder.
  if (treff.length === 1 && flere) {
    const kontroll = await sok({ adressetekst: treff[0].adressetekstutenadressetilleggsnavn ?? treff[0].adressetekst, ...fast });
    const bekreftet = unike(kontroll.adresser).filter(a => passer(a, lesninger));
    if (bekreftet.length && !kontroll.flere) { treff = bekreftet; flere = false; }
  }
  if (treff.length) return { treff, flere, lignende: [] };

  // Forslag: helst fra fritekstsøket (alle ordene fantes), så fra søket som tåler skrivefeil,
  // og til slutt samme adresse andre steder. De som har mest til felles med stedet som er skrevet, står først.
  const lik = a => ligner(a, d, lesninger);
  const lignende = [vanlige, uklare, funnet].map(liste => liste.filter(lik)).find(liste => liste.length) ?? [];
  const fellesMedStedet = a => (d ? d.stedsord.filter(o => stedsordFor(a).has(o)).length : 0);
  return { treff, flere, lignende: [...lignende].sort((a, b) => fellesMedStedet(b) - fellesMedStedet(a)) };
}

const somKandidat = a => ({
  adresse: a.adressetekst,
  postnummer: a.postnummer ?? null,
  poststed: a.poststed ?? null,
  kommunenavn: a.kommunenavn ?? null,
  kommunenummer: a.kommunenummer ?? null,
});

// Slår opp én adresse. Gjetter aldri: finnes adressen flere steder, eller ikke nøyaktig slik den er
// skrevet, kastes en feil med kandidater (status 400 eller 404) i stedet for at første treff brukes.
// filter kan ha kommunenummer og postnummer.
export async function slaaOppAdresse(adresseStreng, filter = {}) {
  const tekst = forenkle(adresseStreng).trim().replace(/\s+/g, ' ');
  const nokkel = [ord(tekst).join(' '), filter.kommunenummer ?? '', filter.postnummer ?? ''].join('|');
  const cachet = hentCache('adresse', nokkel);
  if (cachet) return { ...cachet, cachet: true };

  const { treff, flere, lignende } = await finnAdresser(tekst, filter);

  if (treff.length !== 1 || flere) {
    const feil = new Error(treff.length ? 'Adressen finnes flere steder' : 'Ingen adressetreff');
    feil.status = treff.length ? 400 : 404;
    feil.sok = adresseStreng;
    feil.antall = flere ? null : treff.length;   // ukjent når registeret har flere treff enn vi fikk
    feil.kandidater = (treff.length ? treff : lignende).slice(0, MAKS_KANDIDATER).map(somKandidat);
    throw feil;
  }

  const a = treff[0];
  const lat = a.representasjonspunkt.lat;
  const lon = a.representasjonspunkt.lon;
  const utm = wgs84TilUtm33(lat, lon);

  const resultat = {
    adresse: a.adressetekst,
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

  settCache('adresse', nokkel, resultat);
  return resultat;
}
