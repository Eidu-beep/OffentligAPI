import { hentJson } from '../utils/wms.js';
import { hentCache, settCache } from '../utils/cache.js';
import { wgs84TilUtm33 } from '../utils/geo.js';

// Kartverkets adresse-API søker i matrikkelens adresser, som er det offisielle adresseregisteret.
const ADRESSE_URL = 'https://ws.geonorge.no/adresser/v1/sok';
// Søk på gate og husnummer henter det meste API-et gir i ett svar. Finnes det enda flere treff, kan vi ikke
// vite at adressen er entydig. Fritekstsøk gir mange løse treff, og der holder de hundre første.
const TREFF_PER_SOK = 1000;
const TREFF_PER_FRITEKSTSOK = 100;
// Kontrollen av en annen skrivemåte henter alle adresser med samme husnummer i området, side for side.
// Oslo har rundt 1300 adresser med husnummer 1, så fem sider er god margin.
const MAKS_SIDER = 5;
const MAKS_KANDIDATER = 10;
// Feltene vi bruker. Uten denne listen sender API-et alt det har om hver adresse.
const FELT = ['adressetekst', 'adressetekstutenadressetilleggsnavn', 'adressenavn', 'nummer', 'bokstav', 'postnummer', 'poststed',
  'kommunenummer', 'kommunenavn', 'gardsnummer', 'bruksnummer', 'festenummer', 'representasjonspunkt']
  .map(felt => 'adresser.' + felt).join(',') + ',metadata.totaltAntallTreff';
// Ord som kan stå i en adresse uten å bety noe for oppslaget: «Storgata 1 i Oslo kommune, Norge»
const OVERFLODIGE_ORD = new Set(['i', 'kommune', 'norge', 'norway']);
// Bolignummer (H0201, U0101, K0101, L0101) sier hvilken bolig i bygningen det gjelder, ikke hvor adressen er.
// Med mellomrom («H 0201») tas det ikke bort: «Storgata 1 H 0155 Oslo» er husbokstav og postnummer.
const BOLIGNUMMER = /(^|[\s,;(])[hkul]\d{4}(?=[\s,;).]|$)/gu;
const TALL_OG_BOKSTAV = /(\d)\s+([a-hj-zæøå])(?![\p{L}\p{N}])/gu;   // «12 b» er det samme som «12b»
const TALL_OG_I = /(\d)\s+i(?![\p{L}\p{N}])/gu;                       // «4 i» kan være husbokstaven I
// Endelser som skrives på flere måter: Storgata, Storgaten og Storgate er samme gate, og Kirkeveien,
// Kirkevegen, Kirkevei og Kirkeveg er samme vei. Det må stå noe foran endelsen.
const ENDELSER = [[/(?:gata|gaten|gate|gt)$/u, 'gate'], [/(?:veien|vegen|vei|veg)$/u, 'vei']];
const GATE_ENDELSE = /^(.*?)(gata|gaten|gate)$/u;
const VEI_ENDELSE = /^(.*?)(veien|vegen|vei|veg)$/u;
const BARE_ENDELSE = /^(?:gata|gaten|gate|gt|veien|vegen|vei|veg)$/u;

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

// Rydder i teksten før den søkes etter: bolignummer tas bort («Storgata 1 H0201, 0155 Oslo» og
// «Storgata 1 (H0201)» er adressen Storgata 1), og «Storgt.1» får mellomrom foran husnummeret.
export function ryddTekst(tekst) {
  return forenkle(tekst)
    .replace(BOLIGNUMMER, '$1')
    .replace(/\(\s*\)/g, ' ')
    .replace(/(\p{L})\.(\d)/gu, '$1. $2')
    .replace(/\s+/g, ' ')
    .replace(/ ,/g, ',')
    .trim();
}

// Går gjennom ordene foran husnummeret, altså gatenavnet. Ordene etter er stedet, og endres ikke.
function endreGatenavnet(tekst, endre) {
  const deler = forenkle(tekst).split(/([\s,;]+)/);   // ord og skilletegn annenhver gang
  const ordene = deler.flatMap((del, i) => (i % 2 === 0 && del ? [i] : []));
  for (let n = 0; n < ordene.length && !/^\d/.test(deler[ordene[n]]); n++) {
    deler[ordene[n]] = endre(deler[ordene[n]], deler[ordene[n + 1]] ?? '');
  }
  return deler.join('');
}

// Skriver forkortelsene i gatenavnet helt ut: «Storgt. 1», «Karl Johans gt 1», «Kirkevn. 5», «Kirkev. 5» og
// «Karl Johans vn. 1». vn og v regnes bare som forkortelser med punktum etter, fordi navn som Nyhavn ender på
// vn. «v.» alene regnes bare som en forkortelse rett foran husnummeret: i «V. Strandgate» betyr det noe annet.
// medV = false lar «v.» stå: det kan også bety vika eller vollen, og da avgjøres det av hvilke navn som finnes.
export function utenForkortelser(tekst, medV = true) {
  return endreGatenavnet(tekst, (o, neste) => {
    if (o === 'vn.') return 'vei';
    if (o === 'v.' && /^\d/.test(neste)) return medV ? 'vei' : o;
    return o.replace(/^(\p{L}*)gt\.?$/u, '$1gate').replace(medV ? /^(\p{L}{2,})(?:vn|v)\.$/u : /^(\p{L}{2,})vn\.$/u, '$1vei');
  });
}

// Søket som tåler skrivefeil, sammenligner ordene med stammene i registeret (grønnegat for Grønnegata), men
// finner ikke stammen til ordet som er skrevet. «gronnegaten» er for langt unna, «gronnegat» er det ikke.
const medStamme = tekst => endreGatenavnet(tekst, o => o.replace(/(?:gata|gaten|gate)$/u, 'gat').replace(/veien$/u, 'vei').replace(/vegen$/u, 'veg'));

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

// Æ, ø og å kan skrives uten disse bokstavene: Tromsø som Tromso eller Tromsoe, Ålesund som Alesund eller
// Aalesund, Bærum som Baerum. Aksenter kan utelates: Bygdøy allé som Bygdoy alle.
const ERSTATNINGER = { æ: ['ae'], ø: ['o', 'oe'], å: ['a', 'aa'] };
const utenAksent = c => c.normalize('NFD').replace(/\p{M}/gu, '');
// Sant når `skrevet` er `register` med noen av disse bokstavene skrevet uten. En æ, ø, å eller aksent som er
// skrevet, må stå på samme plass i registeret: «Åsveien» er ikke «Asveien», og «Kåbelvag» er ikke «Kabelvåg».
// Med begynnelse = true holder det at `skrevet` er begynnelsen av `register` («kirkev» for kirkeveien).
export function kanSkrivesSom(skrevet, register, begynnelse = false) {
  const kjent = new Map();
  const fra = (i, j) => {
    if (begynnelse && i === skrevet.length) return true;
    if (j === register.length) return i === skrevet.length;
    const nokkel = i * 10000 + j;
    if (!kjent.has(nokkel)) {
      const c = register[j];
      const former = new Set([c, ...(ERSTATNINGER[c] ?? []), utenAksent(c)]);
      kjent.set(nokkel, [...former].some(f => f && skrevet.startsWith(f, i) && fra(i + f.length, j + 1)));
    }
    return kjent.get(nokkel);
  };
  return fra(0, 0);
}
// Ordet slik det er skrevet (t), og slik det står i registeret (r)
const likeStedsord = (t, r) => t === r || kanSkrivesSom(t, r);

// Gatenavnet uten mellomrom og tegn, og med én form av endelsen. «Karl Johans gt» og «Karl Johansgate» gir
// begge karljohansgate, og «Kirkevegen» og «Kirkeveien» gir kirkevei.
export function navnenokkel(ordene) {
  const s = ordene.join('').replace(/[^\p{L}\p{N}]/gu, '');
  for (const [endelse, ny] of ENDELSER) {
    const m = s.match(endelse);
    if (m && m.index >= 2) return s.slice(0, m.index) + ny;
  }
  return s;
}

// Andre former av gatenavnet å søke etter. Registeret finner selv Storgata, Storgaten og Storgate for hverandre,
// og Kirkeveien for Kirkevei, men ikke Kirkeveien for Kirkevegen. Det finner heller ikke «Karl Johans gate»
// når navnet er skrevet i ett ord, eller «Kongensgate» når det er skrevet i to.
export function andreNavneformer(navn) {
  const ordene = forenkle(navn).split(/\s+/).filter(Boolean);
  if (!ordene.length) return [];
  const sist = ordene.at(-1);
  const foran = ordene.slice(0, -1);
  const former = new Set();
  const legg = (...deler) => former.add(deler.join(' '));
  for (const endelse of [GATE_ENDELSE, VEI_ENDELSE]) {
    const m = sist.match(endelse);
    if (!m) continue;
    const [, stamme, slutt] = m;
    // Registeret finner alle endelsene til samme rot. vei og veg er to røtter.
    const rot = endelse === GATE_ENDELSE ? 'gate' : slutt.startsWith('vei') ? 'vei' : 'veg';
    const annenRot = rot === 'vei' ? 'veg' : rot === 'veg' ? 'vei' : null;
    if (stamme.length >= 2) {
      if (annenRot) legg(...foran, stamme + annenRot);                     // kirkevegen → kirkevei
      for (const r of [rot, annenRot].filter(Boolean)) legg(...foran, stamme, r);   // øvrevei → øvre vei, øvre veg
    } else if (!stamme && foran.length) {
      if (annenRot) legg(...foran, annenRot);                             // kongens vegen → kongens vei
      for (const r of [rot, annenRot].filter(Boolean)) legg(...foran.slice(0, -1), foran.at(-1) + r);   // kongens gate → kongensgate
    }
    break;
  }
  former.delete(ordene.join(' '));
  return [...former];
}

const adressetekster = a => [a.adressetekst, a.adressetekstutenadressetilleggsnavn].map(ord).filter(adr => adr.length);
const stedsordFor = a => new Set([a.postnummer, a.poststed, a.kommunenavn].flatMap(ord));
const begynnerMed = (sokeord, adr) => adr.length <= sokeord.length && adr.every((o, i) => o === sokeord[i]);

// Hvilke av adressens navn (0 postnummer, 1 poststed, 2 kommunenavn) ordene i `rest` er. Hele navn, i hvilken som
// helst rekkefølge, hvert høyst én gang. Gir null når ordene ikke er adressens sted. «Kristiansund» passer for
// poststedet KRISTIANSUND N fordi kommunen heter det, men «Mo» er ikke nok for MO I RANA. `like` avgjør om et
// ord som er skrevet, er likt et ord i registeret.
function stedsnavnene(a, rest, like = (t, r) => t === r) {
  const navn = [a.postnummer, a.poststed, a.kommunenavn].map(ord);
  const sjekk = (pos, brukt) => {
    if (pos === rest.length) return brukt;
    for (let i = 0; i < navn.length; i++) {
      const n = navn[i];
      if (!n.length || brukt.includes(i) || !n.every((o, j) => pos + j < rest.length && like(rest[pos + j], o))) continue;
      const svar = sjekk(pos + n.length, [...brukt, i]);
      if (svar) return svar;
    }
    return OVERFLODIGE_ORD.has(rest[pos]) ? sjekk(pos + 1, brukt) : null;
  };
  return sjekk(0, []);
}

// Sant når søketeksten er nøyaktig denne adressen, eventuelt fulgt av adressens eget postnummer, poststed
// eller kommunenavn. Kartverkets søk er romslig: «storgata» treffer også «Nedre Storgate», og et husnummer
// kan treffe andre tall i adressen. Derfor kontrolleres hvert treff her.
export function passer(a, lesninger) {
  return lesninger.some(sokeord => adressetekster(a).some(adr =>
    begynnerMed(sokeord, adr) && stedsnavnene(a, sokeord.slice(adr.length)) !== null));
}

// Når ingen adresse passer nøyaktig: er dette adressen, skrevet på en annen måte? Husnummer og bokstav må være
// de samme, og stedet må være adressens eget. Gir { type, sted } der sted er navnene stedet passet med, og type er
// - 'samme' når bare skrivemåten skiller: Storgaten 1 for Storgata 1, Kirkevegen for Kirkeveien, Tromso for Tromsø
// - 'lengre' når navnet i registeret har flere ord foran: Øvre Storgate 10 for Storgate 10. Det kan være riktig
//   adresse, men brukes aldri som treff. Sammen med en adresse som passer, gjør det at teksten ikke er entydig.
//   Alene blir det et forslag.
// Gir null ellers. Med forkortet = true slutter gatenavnet som er skrevet, med «v.»: da passer alle navn som
// begynner slik («Kirkev.» passer for Kirkeveien, Kirkevegen og Kirkevika).
export function skrivemaate(a, lesninger, forkortet = false) {
  if (!a.adressenavn) return null;   // matrikkeladresser har ikke gatenavn
  const nummer = `${a.nummer}${a.bokstav ?? ''}`.toLowerCase();
  const navn = ord(a.adressenavn);
  const nokkel = forkortet ? (ordene => ordene.join('').replace(/[^\p{L}\p{N}]/gu, '')) : navnenokkel;
  const hele = nokkel(navn);
  const haler = navn.slice(1).map((_, i) => nokkel(navn.slice(i + 1)));
  // Tilleggsnavnet kan stå først: «Torvet, Storgaten 8A»
  const alle = ord(a.adressetekst);
  const tillegg = alle.slice(0, Math.max(0, alle.length - ord(a.adressetekstutenadressetilleggsnavn).length));
  let svar = null;
  for (const sokeord of lesninger) {
    for (let p = 1; p < sokeord.length; p++) {
      if (sokeord[p] !== nummer) continue;
      const sted = stedsnavnene(a, sokeord.slice(p + 1), likeStedsord);
      if (!sted) continue;
      const skrevet = sokeord.slice(0, p);
      const medTillegg = tillegg.length && tillegg.every((o, i) => skrevet[i] !== undefined && likeStedsord(skrevet[i], o));
      for (const navnet of medTillegg ? [skrevet, skrevet.slice(tillegg.length)] : [skrevet]) {
        const skrevetNokkel = nokkel(navnet);
        if (kanSkrivesSom(skrevetNokkel, hele, forkortet)) return { type: 'samme', sted };
        // «Gate 10» alene sier ikke hvilken gate. Da teller ikke Kongens gate 10 som en mulig adresse.
        if (!svar && !BARE_ENDELSE.test(skrevetNokkel) && haler.some(hale => kanSkrivesSom(skrevetNokkel, hale, forkortet))) {
          svar = { type: 'lengre', sted };
        }
      }
    }
  }
  return svar;
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

const adressenokkel = a => `${a.kommunenummer}|${a.postnummer}|${ord(a.adressetekst).join(' ')}`;

function unike(adresser) {
  const sett = new Map();
  for (const a of adresser) {
    const nokkel = adressenokkel(a);
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

// Et søk som bare gir forslag eller andre skrivemåter, skal ikke stoppe oppslaget om det feiler.
// Da vet vi bare ikke om vi har sett alle adressene.
const sokEllerIngen = (parametre, antall) => sok(parametre, antall).catch(() => ({ adresser: [], flere: false, feilet: true }));

// Henter alle treffene, side for side. komplett er false når det er flere enn MAKS_SIDER sider, eller et kall feilet.
async function sokAlle(parametre) {
  const adresser = [];
  try {
    for (let side = 0; side < MAKS_SIDER; side++) {
      const data = await hentJson(`${ADRESSE_URL}?${new URLSearchParams({
        treffPerSide: String(TREFF_PER_SOK), side: String(side), filtrer: FELT, ...parametre })}`);
      const del = data.adresser ?? [];
      adresser.push(...del);
      const totalt = data.metadata?.totaltAntallTreff;
      if (typeof totalt !== 'number') return { adresser, komplett: false };
      if (adresser.length >= totalt) return { adresser, komplett: true };
      if (!del.length) return { adresser, komplett: false };
    }
  } catch (e) {
    return { adresser, komplett: false };
  }
  return { adresser, komplett: false };
}

// Området som må kontrolleres før en annen skrivemåte godtas: der en annen adresse med samme husnummer også
// kunne passet med stedet som er skrevet. Gir null når det ikke er skrevet noe sted, og det ikke er filter.
// Da kan adressen være hvor som helst i landet. Registerets egen skrivemåte av stedet brukes i søket, fordi
// det ikke finner Tromsø for Tromso. Kommunenavn og poststed søkes begge, for Våler er navnet på to kommuner
// og et poststed.
function kontrollomraader(a, sted, fast) {
  if (fast.postnummer) return [fast];
  if (sted.includes(0)) return [{ ...fast, postnummer: a.postnummer }];
  if (fast.kommunenummer) return [fast];
  const navn = sted.includes(1) ? a.poststed : sted.includes(2) ? a.kommunenavn : null;
  return navn ? [{ poststed: navn }, { kommunenavn: navn }] : null;
}

// Fritekst til Kartverket: komma blir mellomrom og fyllord tas bort. Ellers som skrevet, for «St.Croix gate»
// er ett ord der. Søket krever at alle ordene finnes, så tegn som står alene må også bort, og * (som betyr
// «begynner med») kan ikke sendes videre.
const lagFritekst = tekst => tekst.replace(TALL_OG_BOKSTAV, '$1$2').replace(/\*/g, ' ').split(/[\s,;()]+/)
  .filter(o => /[\p{L}\p{N}]/u.test(o) && !OVERFLODIGE_ORD.has(utenPunktum(o))).join(' ');

// Henter adresser fra registeret og deler dem i de som passer, og de som bare ligner.
// eksakt er false når adressen er funnet med en annen skrivemåte. variant er true når teksten kan være flere
// adresser skrevet på en annen måte.
async function finnAdresser(tekst, filter) {
  const lesninger = lesemaater(tekst);
  const d = tolkSoketekst(tekst);
  const fast = {
    ...(filter.kommunenummer ? { kommunenummer: filter.kommunenummer } : {}),
    ...(filter.postnummer ? { postnummer: filter.postnummer } : {}),
  };
  const fritekst = lagFritekst(tekst);
  // En adresse har et navn, eller gårds- og bruksnummer («12/5»). Bare tall og fyllord er ingenting å søke på.
  if (!/\p{L}|\d\/\d/u.test(fritekst)) return { treff: [], flere: false, lignende: [], eksakt: true };
  const husnummer = t => ({ nummer: t.nummer, ...(t.uklarI ? {} : { bokstav: t.bokstav ?? '' }), ...fast });

  // 1. Det mest presise søket. Gate og husnummer søkes felt for felt i hele landet, slik at husnummeret må
  //    være husnummeret, og stedet kontrolleres her etterpå. Tom bokstav betyr «nummeret uten bokstav».
  //    Annen tekst (matrikkeladresser, og adresser uten husnummer) søkes som fritekst og som adressetekst.
  const svar = await Promise.all(d
    ? [sok({ adressenavn: d.adressenavn, ...husnummer(d) })]
    : [sok({ sok: fritekst, ...fast }, TREFF_PER_FRITEKSTSOK), sok({ adressetekst: tekst, ...fast }, TREFF_PER_FRITEKSTSOK)]);
  const funnet = unike(svar.flatMap(s => s.adresser));
  let flere = svar.some(s => s.flere);
  let treff = funnet.filter(a => passer(a, lesninger));

  // 2. Ingen passet. Prøv fritekst (teksten kan være delt feil i gate og nummer), og hent adresser med
  //    nesten samme skrivemåte til forslag. Samtidig hentes andre former av gatenavnet (trinn 4).
  //    Forkortelsene i gatenavnet skrives ut i disse søkene, men ikke når det avgjøres om teksten er nøyaktig adressen.
  const utvidet = utenForkortelser(tekst);
  const dUtvidet = d && tolkSoketekst(utvidet);
  let vanlige = d ? [] : funnet;
  let uklare = [];
  let andre = [];
  if (!treff.length && d) {
    const navneformer = dUtvidet
      ? [...new Set([dUtvidet.adressenavn, ...andreNavneformer(dUtvidet.adressenavn)])].filter(n => n !== d.adressenavn)
      : [];
    const [vanlig, uklart, ...former] = await Promise.all([
      sok({ sok: lagFritekst(utvidet), ...fast }, TREFF_PER_FRITEKSTSOK),
      sokEllerIngen({ sok: lagFritekst(medStamme(utvidet)), fuzzy: 'true', ...fast }, TREFF_PER_FRITEKSTSOK),
      ...navneformer.map(navn => sokEllerIngen({ adressenavn: navn, ...husnummer(dUtvidet) })),
    ]);
    vanlige = unike(vanlig.adresser);
    treff = vanlige.filter(a => passer(a, lesninger));
    flere = vanlig.flere;
    uklare = unike(uklart.adresser);
    andre = former.flatMap(s => s.adresser);
  }

  // 3. Søket ga flere treff enn vi fikk, og bare én adresse passet. Kontroller mot adresseteksten at den
  //    virkelig er den eneste, i stedet for å melde at adressen finnes flere steder.
  if (treff.length === 1 && flere) {
    const kontroll = await sok({ adressetekst: treff[0].adressetekstutenadressetilleggsnavn ?? treff[0].adressetekst, ...fast });
    const bekreftet = unike(kontroll.adresser).filter(a => passer(a, lesninger));
    if (bekreftet.length && !kontroll.flere) { treff = bekreftet; flere = false; }
  }
  if (treff.length) return { treff, flere, lignende: [], eksakt: true };

  // 4. Andre skrivemåter. Søkene over finner adressene teksten kan være, men kanskje ikke alle. Før en annen
  //    skrivemåte godtas, hentes derfor alle adressene med samme husnummer i området stedet gjelder, uansett
  //    gatenavn, og alle vurderes. Er nøyaktig én adresse det teksten kan være, er det den. Kan den være flere,
  //    svarer vi som når adressen finnes flere steder. Kunne ikke området kontrolleres (ikke noe sted skrevet,
  //    for mange adresser, eller et kall feilet), blir det bare forslag. Det blir det også når bare lengre navn
  //    passer («Kirkeveien 1, Kristiansand», der bare Oddernes kirkevei 1 finnes).
  let forst = [];
  if (d && dUtvidet) {
    // «Kirkev.» skrives ut til kirkevei i søkene, men vurderes som en forkortelse: navn som begynner med kirkev
    const utenV = utenForkortelser(tekst, false);
    const forkortet = utenV !== utvidet;
    const lesningerUtvidet = lesemaater(utenV);
    const samme = [];
    const lengre = [];
    const sett = new Set();
    let anker = null;
    const vurder = adresser => {
      for (const a of adresser) {
        const nokkel = adressenokkel(a);
        if (sett.has(nokkel)) continue;
        sett.add(nokkel);
        const s = skrivemaate(a, lesningerUtvidet, forkortet);
        if (!s) continue;
        (s.type === 'samme' ? samme : lengre).push(a);
        if (!anker || (s.type === 'samme' && !samme.includes(anker.a))) anker = { a, sted: s.sted };
      }
    };
    vurder([...funnet, ...vanlige, ...uklare, ...andre]);
    let kontrollert = false;
    const omraader = anker && kontrollomraader(anker.a, anker.sted, fast);
    if (omraader) {
      const nummer = { nummer: String(anker.a.nummer), ...(dUtvidet.uklarI ? {} : { bokstav: anker.a.bokstav ?? '' }) };
      const kontroll = await Promise.all(omraader.map(omraade => sokAlle({ ...nummer, ...omraade })));
      vurder(kontroll.flatMap(k => k.adresser));
      kontrollert = kontroll.every(k => k.komplett);
    }
    if (samme.length === 1 && !lengre.length && kontrollert) return { treff: samme, flere: false, lignende: [], eksakt: false };
    if (samme.length && samme.length + lengre.length >= 2) {
      return { treff: [...samme, ...lengre], flere: !kontrollert, lignende: [], eksakt: false, variant: true };
    }
    forst = [...samme, ...lengre];
  }

  // Forslag: først adressene fra trinn 4, så fra fritekstsøket (alle ordene fantes), så fra søket som tåler
  // skrivefeil, og til slutt samme adresse andre steder. De som har mest til felles med stedet som er skrevet,
  // står først.
  const lik = a => ligner(a, d, lesninger);
  const lignende = [vanlige, uklare, funnet].map(liste => liste.filter(lik)).find(liste => liste.length) ?? [];
  const fellesMedStedet = a => (d ? d.stedsord.filter(o => stedsordFor(a).has(o)).length : 0);
  const sortert = [...lignende].sort((a, b) => fellesMedStedet(b) - fellesMedStedet(a));
  return { treff, flere, lignende: unike([...forst, ...sortert]), eksakt: true };
}

const somKandidat = a => ({
  adresse: a.adressetekst,
  postnummer: a.postnummer ?? null,
  poststed: a.poststed ?? null,
  kommunenavn: a.kommunenavn ?? null,
  kommunenummer: a.kommunenummer ?? null,
});

// Slår opp én adresse. Velger aldri mellom flere adresser: finnes adressen flere steder, eller ikke slik den
// er skrevet, kastes en feil med kandidater (status 400 eller 404) i stedet for at første treff brukes.
// En annen skrivemåte av samme adresse (Storgaten for Storgata, Tromso for Tromsø) godtas når nøyaktig én
// adresse passer. Da er eksaktTreff false. filter kan ha kommunenummer og postnummer.
export async function slaaOppAdresse(adresseStreng, filter = {}) {
  const tekst = ryddTekst(adresseStreng);
  // Forkortelsene er med i nøkkelen: «Kirkev. 1» er en forkortelse, «Kirkev 1» er det ikke
  const nokkel = [ord(tekst).join(' '), ord(utenForkortelser(tekst)).join(' '), filter.kommunenummer ?? '', filter.postnummer ?? ''].join('|');
  const cachet = hentCache('adresse', nokkel);
  if (cachet) return { ...cachet, cachet: true };

  const { treff, flere, lignende, eksakt, variant } = await finnAdresser(tekst, filter);

  if (treff.length !== 1 || flere) {
    const feil = new Error(!treff.length ? 'Ingen adressetreff' : variant ? 'Adressen kan være flere adresser' : 'Adressen finnes flere steder');
    feil.status = treff.length ? 400 : 404;
    feil.variant = Boolean(variant);
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
    eksaktTreff: eksakt,
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
