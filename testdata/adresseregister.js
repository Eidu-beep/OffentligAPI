// Et lite adresseregister til testene. Det søker slik Kartverkets adresse-API gjør, kontrollert mot
// reelle kall 2026-10-07 (ws.geonorge.no/adresser/v1/sok):
// - sok: alle ordene må finnes i adressen, men i hvilket som helst felt. «storgata 1 elverum» treffer
//   derfor også Storgata 12 når bruksnummeret er 1, og «markveien 1» treffer Markveien 1A.
//   Med fuzzy=true godtas skrivefeil: én i ord på tre til fem tegn, to i lengre ord. Ordet som er skrevet,
//   sammenlignes med ordene i registeret og stammene deres, men stammen til det som er skrevet finnes ikke:
//   «gronnegaten» er tre feil unna «grønnegat», «gronnegat» bare én. En stjerne sist i et ord betyr «begynner med».
//   Et tomt søk, og stjerne sammen med fuzzy=true, gir HTTP 400 i det ekte API-et. Her kastes en feil,
//   så testene ser det.
//   Stedsnavn med æ, ø og å skrevet uten (Tromso, Kabelvag) finnes bare med fuzzy=true. Det samme gjør
//   Kirkevegen for Kirkeveien (kontrollert 2026-10-08).
//   Rekkefølgen på treffene er ikke til å stole på, så de løse treffene står før de eksakte her.
// - adressenavn: treffer også andre former og lengre navn (storgata gir Storgaten og Nedre Storgate),
//   men ikke vegen for veien, og ikke «Karl Johansgate» for «Karl Johans gate».
// - adressetekst: ordene må stå etter hverandre i adresseteksten.
// - bokstav uten verdi gir bare adresser uten bokstav. postnummer og kommunenummer må være like.
// - poststed og kommunenavn: ett av ordene må være et ord i navnet («nordre follo» gir også Nordre Land).
// - side gir neste side med treff (0 er den første).
// - totaltAntallTreff forteller hvor mange som finnes, også når treffPerSide gir færre.
// - filtrer velger hvilke felt som kommer med i svaret.
// Storgata 1 i Oslo, Svolvær, Kabelvåg og Elverum, Øvre Storgate 10, Torvet i Kragerø, Flaga på Voss, Kirkeveien 1
// og 5 i Oslo, Kirkevegen 1 i Lødingen, Karl Johans gate 1, Kongensgate 1 i Åndalsnes, Bygdøy allé 5, Grønnegata 1
// i Tromsø og de to kirkeveiene i Kristiansand finnes slik i registeret. Resten er laget for testene, og
// koordinatene er ikke de ekte.

import { ADRESSE } from './svar.js';

const EKTE = ADRESSE.adresser[0];   // Storgata 1 i Oslo, slik adresse-API-et svarer
let lopenummer = 0;

function adresse(adressenavn, nummer, bokstav, postnummer, poststed, kommunenummer, kommunenavn, gardsnummer, bruksnummer, tillegg = {}) {
  const gate = `${adressenavn} ${nummer}${bokstav}`;
  return {
    ...EKTE,
    adressenavn, adressetekst: gate, adressetekstutenadressetilleggsnavn: gate, adressekode: 1000 + nummer,
    nummer, bokstav, postnummer, poststed, kommunenummer, kommunenavn, gardsnummer, bruksnummer,
    // Hver adresse får sitt eget punkt, slik at oppslagene i en test ikke hentes fra cachen til en annen
    representasjonspunkt: { ...EKTE.representasjonspunkt, lat: 60 + (lopenummer++) / 1000, lon: 10.5 },
    ...tillegg,
  };
}

function matrikkeladresse(tilleggsnavn, gardsnummer, bruksnummer, postnummer, poststed, kommunenummer, kommunenavn) {
  const tekst = `${gardsnummer}/${bruksnummer}`;
  return adresse(null, null, null, postnummer, poststed, kommunenummer, kommunenavn, gardsnummer, bruksnummer, {
    adressetekst: tilleggsnavn ? `${tilleggsnavn}, ${tekst}` : tekst, adressetilleggsnavn: tilleggsnavn,
    adressetekstutenadressetilleggsnavn: tekst, adressekode: null, objtype: 'Matrikkeladresse', undernummer: 0,
  });
}

export const ADRESSER = [
  // Storgata 1–20 i Oslo, slik at hver test kan bruke sin egen adresse. Den første er det ekte svaret uendret
  ...Array.from({ length: 20 }, (_, i) => adresse('Storgata', i + 1, '', '0155', 'OSLO', '0301', 'OSLO', 208, 619 + i, {
    adressekode: EKTE.adressekode,
    representasjonspunkt: { ...EKTE.representasjonspunkt, lat: EKTE.representasjonspunkt.lat + i / 1000 },
  })),
  // Samme adresse i samme kommune, men med hvert sitt postnummer
  adresse('Storgata', 1, '', '8300', 'SVOLVÆR', '1865', 'VÅGAN', 18, 1831),
  adresse('Storgata', 1, '', '8310', 'KABELVÅG', '1865', 'VÅGAN', 13, 40),
  adresse('Storgata', 12, '', '2408', 'ELVERUM', '3420', 'ELVERUM', 28, 1),   // bruksnummer 1 gir treff på «storgata 1 elverum»
  adresse('Storgata', 1, '', '2408', 'ELVERUM', '3420', 'ELVERUM', 28, 74),
  adresse('Storgata', 12, 'B', '5124', 'MORVIK', '4601', 'BERGEN', 190, 12),
  // Poststed med flere ord, og poststed som er lengre enn kommunenavnet
  adresse('Storgata', 1, '', '8610', 'MO I RANA', '1833', 'RANA', 21, 135),
  adresse('Storgata', 1, '', '6509', 'KRISTIANSUND N', '1505', 'KRISTIANSUND', 1, 24),
  // «4 i Bergen»: husnummer 4 i Bergen, eller husnummer 4I?
  adresse('Myrveien', 4, '', '5099', 'BERGEN', '4601', 'BERGEN', 300, 1),
  adresse('Myrveien', 4, 'I', '5099', 'BERGEN', '4601', 'BERGEN', 300, 2),
  adresse('Bakken', 4, '', '5099', 'BERGEN', '4601', 'BERGEN', 300, 3),
  adresse('Haugen', 7, 'I', '5099', 'BERGEN', '4601', 'BERGEN', 300, 4),
  // Tre gater som ligner på hverandre i samme kommune
  adresse('Øvre Storgate', 10, '', '3018', 'DRAMMEN', '3301', 'DRAMMEN', 114, 1098),
  adresse('Nedre Storgate', 10, '', '3015', 'DRAMMEN', '3301', 'DRAMMEN', 113, 250),
  adresse('Storgaten', 10, '', '3060', 'SVELVIK', '3301', 'DRAMMEN', 301, 44),
  // Husnummeret finnes bare med bokstav
  adresse('Markveien', 1, 'A', '0554', 'OSLO', '0301', 'OSLO', 228, 351),
  adresse('Markveien', 1, 'B', '0554', 'OSLO', '0301', 'OSLO', 228, 352),
  // Adresse med tilleggsnavn
  adresse('Storgata', 8, 'A', '3770', 'KRAGERØ', '4014', 'KRAGERØ', 32, 331, {
    adressetekst: 'Torvet, Storgata 8A', adressetilleggsnavn: 'Torvet',
  }),
  // Matrikkeladresser: eiendommer uten gateadresse
  matrikkeladresse('Flaga', 12, 5, '5708', 'VOSS', '4621', 'VOSS'),
  matrikkeladresse(null, 12, 5, '9692', 'MÅSØY', '5618', 'MÅSØY'),
  // Samme adresse mange steder: Fjellveien 7 i 120 kommuner
  ...Array.from({ length: 120 }, (_, i) => adresse('Fjellveien', 7, '', String(7000 + i), `STED${i}`, String(5000 + i), `KOMMUNE${i}`, 10, 20)),
  // Ett eksakt treff blant mange løse: 120 husnummer i Dalveien i Testby har bruksnummer 7, og så Dalveien 7
  ...Array.from({ length: 120 }, (_, i) => adresse('Dalveien', 100 + i, '', '6999', 'TESTBY', '4999', 'TESTBY', 3, 7)),
  adresse('Dalveien', 7, '', '6999', 'TESTBY', '4999', 'TESTBY', 3, 3),
  // Flere treff enn API-et gir i ett svar (1000): Langveien 3 på 1100 steder
  ...Array.from({ length: 1100 }, (_, i) => adresse('Langveien', 3, '', String(1000 + i), `BYGD${i}`, String(2000 + i), `HERAD${i}`, 30, 40)),
  // Én matrikkeladresse blant mange løse treff: 9/9 i Storby, der 1100 adresser har gårds- og bruksnummer 9.
  // Den står først, slik det ekte API-et rangerer et eksakt treff. Fritekstsøket henter de hundre første,
  // så etter dem ville den ikke blitt funnet.
  matrikkeladresse(null, 9, 9, '6998', 'STORBY', '4998', 'STORBY'),
  ...Array.from({ length: 1100 }, (_, i) => adresse('Sletta', 1 + i, '', '6998', 'STORBY', '4998', 'STORBY', 9, 9)),
  // Andre skrivemåter: vei og veg, navn i ett eller to ord, aksenter, og æ, ø og å
  adresse('Kirkeveien', 1, '', '0266', 'OSLO', '0301', 'OSLO', 212, 517),
  adresse('Kirkeveien', 1, 'B', '0266', 'OSLO', '0301', 'OSLO', 212, 518),
  adresse('Kirkevegen', 1, '', '8410', 'LØDINGEN', '1851', 'LØDINGEN', 28, 389),
  adresse('Karl Johans gate', 1, '', '0154', 'OSLO', '0301', 'OSLO', 207, 80),
  adresse('Kongensgate', 1, '', '6300', 'ÅNDALSNES', '1539', 'RAUMA', 105, 61),
  adresse('Bygdøy allé', 5, '', '0257', 'OSLO', '0301', 'OSLO', 211, 17),
  adresse('Grønnegata', 1, '', '9008', 'TROMSØ', '5501', 'TROMSØ', 200, 1466),
  // Lengre navn. I Kristiansand finnes ingen Kirkeveien 1, bare to kirkeveier med flere ord i navnet.
  // Gamle Kirkevei 5 i Oslo er laget for testene: der kan «Kirkevegen 5, Oslo» være to adresser.
  adresse('Oddernes kirkevei', 1, '', '4630', 'KRISTIANSAND S', '4204', 'KRISTIANSAND', 152, 2),
  adresse('Greipstad gamle kirkeveg', 1, '', '4645', 'NODELAND', '4204', 'KRISTIANSAND', 37, 4),
  adresse('Kirkeveien', 5, '', '0266', 'OSLO', '0301', 'OSLO', 212, 521),
  adresse('Gamle Kirkevei', 5, '', '0377', 'OSLO', '0301', 'OSLO', 40, 2),
  // Samme navn i ett og to ord i samme by, laget for testene. Søkene på navnet finner ikke Øvre vei 8E for
  // «Ovrevegen 8E»; det gjør bare kontrollen av alle adresser med husnummeret i området.
  adresse('Nygaten', 3, '', '5015', 'BERGEN', '4601', 'BERGEN', 165, 30),
  adresse('Ny gate', 3, '', '5015', 'BERGEN', '4601', 'BERGEN', 165, 31),
  adresse('Øvreveien', 8, 'E', '1405', 'LANGHUS', '3207', 'NORDRE FOLLO', 99, 1),
  adresse('Øvre vei', 8, 'E', '1405', 'LANGHUS', '3207', 'NORDRE FOLLO', 99, 2),
  // Forkortelse foran et sted med punktum etter, og et navn uten å der det finnes et med å
  adresse('Kirkeveien', 3, '', '2860', 'HOV', '3449', 'SØNDRE LAND', 60, 3),
  adresse('Asveien', 2, '', '1400', 'SKI', '3207', 'NORDRE FOLLO', 134, 9),
  // «Strandv.» kan være begge disse (laget for testene)
  adresse('Strandveien', 1, '', '0250', 'OSLO', '0301', 'OSLO', 209, 1),
  adresse('Strandvika', 1, '', '0250', 'OSLO', '0301', 'OSLO', 209, 2),
];

// Ordene i en tekst, slik søket ser dem
const ordene = tekst => String(tekst ?? '').toLowerCase().split(/[\s,\-]+/).map(o => o.replace(/\.+$/, '')).filter(Boolean);
// Bestemt og ubestemt form regnes som samme ord: storgata, storgaten og storgate
const stamme = o => (o.length >= 6 ? o.replace(/(en|a|e)$/, '') : o);

function avstand(a, b) {   // Levenshtein
  const rad = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let forrige = rad[0];
    rad[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const hold = rad[j];
      rad[j] = Math.min(rad[j] + 1, rad[j - 1] + 1, forrige + (a[i - 1] === b[j - 1] ? 0 : 1));
      forrige = hold;
    }
  }
  return rad[b.length];
}

// Hvor mange skrivefeil søket som tåler skrivefeil godtar i et ord
const feilGodtatt = o => (o.length <= 2 ? 0 : o.length <= 5 ? 1 : 2);

function likeOrd(a, b, uklart) {
  if (a.endsWith('*')) return b.startsWith(a.slice(0, -1));
  if (stamme(a) === stamme(b)) return true;
  return uklart && !/\d/.test(a) && Math.min(avstand(a, b), avstand(a, stamme(b))) <= feilGodtatt(a);
}

// Sant når ordene i frasen står etter hverandre i teksten
function inneholderFrase(tekst, frase) {
  const t = ordene(tekst);
  const f = ordene(frase);
  return f.length > 0 && t.some((_, start) => f.every((o, i) => t[start + i] !== undefined && likeOrd(o, t[start + i], false)));
}

const KJENTE_PARAMETRE = ['treffPerSide', 'side', 'sok', 'fuzzy', 'adressenavn', 'nummer', 'bokstav', 'adressetekst', 'postnummer',
  'kommunenummer', 'poststed', 'kommunenavn', 'filtrer'];
// Ett av ordene i søket er et ord i navnet
const etOrdI = (navn, sok) => ordene(sok).some(o => ordene(navn).includes(o));

// Svarer på et søk slik adresse-API-et gjør. q er URLSearchParams fra forespørselen.
export function sokIRegister(q) {
  for (const navn of q.keys()) {
    if (!KJENTE_PARAMETRE.includes(navn)) throw new Error(`Testregisteret kjenner ikke parameteren ${navn}`);
  }
  const uklart = q.get('fuzzy') === 'true';
  // «12/5» søkes som 12 og 5, slik at også gårds- og bruksnummer treffer
  const sokeord = q.has('sok') ? q.get('sok').toLowerCase().split(/[\s/]+/).filter(Boolean) : null;
  if (sokeord && !sokeord.length) throw new Error('Testregisteret: tomt søk. Det ekte API-et svarer HTTP 400');
  if (uklart && sokeord?.some(o => o.includes('*'))) throw new Error('Testregisteret: stjerne med fuzzy=true. Det ekte API-et svarer HTTP 400');

  const treff = ADRESSER.filter(a => {
    if (q.has('postnummer') && a.postnummer !== q.get('postnummer')) return false;
    if (q.has('kommunenummer') && a.kommunenummer !== q.get('kommunenummer')) return false;
    if (q.has('nummer') && String(a.nummer) !== q.get('nummer')) return false;
    if (q.has('bokstav') && (a.bokstav ?? '').toLowerCase() !== q.get('bokstav').toLowerCase()) return false;
    if (q.has('adressenavn') && !inneholderFrase(a.adressenavn, q.get('adressenavn'))) return false;
    if (q.has('adressetekst') && !inneholderFrase(a.adressetekst, q.get('adressetekst'))) return false;
    if (q.has('poststed') && !etOrdI(a.poststed, q.get('poststed'))) return false;
    if (q.has('kommunenavn') && !etOrdI(a.kommunenavn, q.get('kommunenavn'))) return false;
    if (sokeord) {
      const felt = [...ordene(a.adressetekst).flatMap(o => o.split('/')), String(a.nummer), a.postnummer,
        ...ordene(a.poststed), ...ordene(a.kommunenavn), String(a.gardsnummer), String(a.bruksnummer)];
      if (!sokeord.every(o => felt.some(f => likeOrd(o.replace(/\.+$/, ''), f, uklart)))) return false;
    }
    return true;
  });

  const antall = Number(q.get('treffPerSide') ?? 10);
  const side = Number(q.get('side') ?? 0);
  const svar = {
    metadata: { treffPerSide: antall, side, totaltAntallTreff: treff.length, viserFra: side * antall, viserTil: (side + 1) * antall, asciiKompatibel: true },
    adresser: structuredClone(treff.slice(side * antall, (side + 1) * antall)),
  };
  if (!q.has('filtrer')) return svar;

  // filtrer=adresser.adressetekst,metadata.totaltAntallTreff gir bare de feltene
  const felt = del => q.get('filtrer').split(',').filter(f => f.startsWith(del + '.')).map(f => f.slice(del.length + 1));
  const bare = (objekt, navn) => Object.fromEntries(navn.filter(n => n in objekt).map(n => [n, objekt[n]]));
  return { metadata: bare(svar.metadata, felt('metadata')), adresser: svar.adresser.map(a => bare(a, felt('adresser'))) };
}
