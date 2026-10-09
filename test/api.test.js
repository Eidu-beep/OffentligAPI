// Tester hele API-et mot etterlignede datakilder (ingen nettverk). Kjør med: npm test
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as svar from '../testdata/svar.js';
import { sokIRegister } from '../testdata/adresseregister.js';

// Miljøet må settes før serveren importeres. Verdiene under er kun testverdier.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';   // tilfeldig ledig port
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'eiendom-test-')), 'test.db');
process.env.ADMIN_KEY = 'lokal-admin';
process.env.API_KEYS = 'lokal-nokkel:Test:0';
process.env.ALLOWED_ORIGINS = 'https://tillatt.example';
process.env.PLAN_AKTIV = 'true';
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;

// Etterligner datakildene. `nede` er tjenester som skal svare med feil i en test.
const ekteFetch = globalThis.fetch;
const nede = new Set();
const kall = [];

function kildeSvar(url) {
  const sti = url.pathname;
  if (url.hostname === 'ws.geonorge.no' && sti === '/adresser/v1/sok') {
    if (nede.has('adresser')) return null;   // adresseregisteret svarer ikke
    if (nede.has('uklart') && url.searchParams.get('fuzzy') === 'true') return null;   // bare søket som tåler skrivefeil
    // Kontrollen av området (søk side for side) svarer ikke, eller sier at det finnes svært mange adresser
    if (nede.has('omraade') && url.searchParams.has('side')) return null;
    if (nede.has('mange') && url.searchParams.has('side')) {
      const svar = sokIRegister(url.searchParams);
      return { ...svar, metadata: { ...svar.metadata, totaltAntallTreff: 999999 } };
    }
    return sokIRegister(url.searchParams);
  }
  if (url.hostname === 'ws.geonorge.no' && sti.startsWith('/eiendom/v1/')) return svar.TEIG;
  if (url.hostname === 'geo.ngu.no' && sti.endsWith('/LosmasserWMS2')) return svar.LOSMASSE_GML;
  if (url.hostname === 'geo.ngu.no' && sti.endsWith('/BerggrunnWMS3')) return svar.BERGGRUNN_GML;
  if (url.hostname === 'nap.ft.dibk.no') return svar.PLAN;
  if (url.hostname === 'api01.nve.no') {
    // Varselet gjelder kommunen det spørres om (kommunenummeret står i adressen)
    const knr = sti.split('/Municipality/')[1]?.split('/')[0];
    return svar.VARSEL.map(v => ({ ...v, MunicipalityList: [{ Id: knr, Name: 'Testkommune', WarningList: null }] }));
  }
  if (url.hostname === 'kart.nve.no') {
    const tjeneste = sti.match(/\/services\/([^/]+)\/MapServer\/identify$/)?.[1];
    if (nede.has(tjeneste)) return svar.NVE_FEIL;
    return svar.NVE[tjeneste] ?? null;
  }
  return null;
}

globalThis.fetch = async (inn, valg) => {
  const url = new URL(String(inn));
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return ekteFetch(inn, valg);
  kall.push(url);
  const data = kildeSvar(url);
  if (data === null) return new Response('Not Found', { status: 404 });
  return typeof data === 'string'
    ? new Response(data, { status: 200, headers: { 'content-type': 'application/vnd.ogc.gml' } })
    : Response.json(data);
};

let server;
let base;
// Hver test kaller fra sin egen IP-adresse, slik Railways proxy oppgir den. Ellers ville testene til sammen
// gått over grensen på 60 kall i minuttet per IP.
let klient = 0;
beforeEach(() => { klient++; });
const hent = (sti, headers = {}) => ekteFetch(`${base}${sti}`, { headers: { 'X-Forwarded-For': `10.0.0.${klient}`, ...headers } });
const medNokkel = { 'X-Api-Key': 'lokal-nokkel' };
// Slår opp en adresse. filter kan ha postnummer og kommunenummer.
const eiendom = (adresse, filter = {}) => hent(`/eiendom?${new URLSearchParams({ adresse, ...filter })}`, medNokkel);
// Søkene som er sendt til adresseregisteret. treffPerSide og filtrer er like i alle, og kontrolleres i én test.
const adressesok = () => kall.filter(u => u.pathname === '/adresser/v1/sok').map(u => {
  const { treffPerSide, filtrer, ...resten } = Object.fromEntries(u.searchParams);
  return resten;
});
const steder = kandidater => kandidater.map(k => `${k.adresse}, ${k.postnummer} ${k.poststed}`);

before(async () => {
  ({ server } = await import('../server.js'));
  if (!server.listening) await new Promise(ok => server.once('listening', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); globalThis.fetch = ekteFetch; });

test('helsesjekk er åpen', async () => {
  const r = await hent('/helse');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('eiendom krever gyldig API-nøkkel', async () => {
  assert.equal((await hent('/eiendom?adresse=Storgata+1,+Oslo')).status, 401);
  assert.equal((await hent('/eiendom?adresse=Storgata+1,+Oslo', { 'X-Api-Key': 'feil' })).status, 403);
  assert.equal((await hent('/eiendom', medNokkel)).status, 400);
});

test('ukjent adresse gir 404', async () => {
  const r = await hent('/eiendom?adresse=finnesikke', medNokkel);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).feil, 'Ingen adressetreff');
});

test('husnummer med bokstav og poststed i stedet for kommune', async () => {
  kall.length = 0;
  const r = await eiendom('Storgata 12 b, Morvik');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.meta.adresse, 'Storgata 12B');
  assert.equal(d.meta.poststed, 'MORVIK');
  assert.equal(d.meta.kommunenavn, 'BERGEN');
  // Ett kall: gate, husnummer og bokstav søkes felt for felt i hele landet, og stedet kontrolleres etterpå
  assert.deepEqual(adressesok(), [{ adressenavn: 'storgata', nummer: '12', bokstav: 'B' }]);
  // Søket ber om flest mulig treff, og bare om feltene som brukes
  const sendt = kall.find(u => u.pathname === '/adresser/v1/sok').searchParams;
  assert.equal(sendt.get('treffPerSide'), '1000');
  assert.match(sendt.get('filtrer'), /^adresser\.adressetekst,.*adresser\.representasjonspunkt,metadata\.totaltAntallTreff$/);
});

test('adresse som finnes flere steder gir 400 med kandidater, ikke første treff', async () => {
  kall.length = 0;
  const r = await eiendom('Storgata 1');
  assert.equal(r.status, 400);
  const d = await r.json();
  assert.equal(d.feil, 'Adressen finnes flere steder');
  assert.match(d.hjelp, /postnummer/);
  assert.equal(d.sok, 'Storgata 1');
  assert.equal(d.antall, 6);
  assert.deepEqual(d.kandidater, [
    { adresse: 'Storgata 1', postnummer: '0155', poststed: 'OSLO', kommunenavn: 'OSLO', kommunenummer: '0301' },
    { adresse: 'Storgata 1', postnummer: '8300', poststed: 'SVOLVÆR', kommunenavn: 'VÅGAN', kommunenummer: '1865' },
    { adresse: 'Storgata 1', postnummer: '8310', poststed: 'KABELVÅG', kommunenavn: 'VÅGAN', kommunenummer: '1865' },
    { adresse: 'Storgata 1', postnummer: '2408', poststed: 'ELVERUM', kommunenavn: 'ELVERUM', kommunenummer: '3420' },
    { adresse: 'Storgata 1', postnummer: '8610', poststed: 'MO I RANA', kommunenavn: 'RANA', kommunenummer: '1833' },
    { adresse: 'Storgata 1', postnummer: '6509', poststed: 'KRISTIANSUND N', kommunenavn: 'KRISTIANSUND', kommunenummer: '1505' },
  ]);
  // Tom bokstav betyr «nummeret uten bokstav»
  assert.deepEqual(adressesok(), [{ adressenavn: 'storgata', nummer: '1', bokstav: '' }]);
  // Ingen andre kilder spørres før adressen er entydig
  assert.deepEqual(kall.filter(u => u.pathname !== '/adresser/v1/sok'), []);
});

test('samme adresse to steder i én kommune: postnummeret skiller dem', async () => {
  // Kommunenavn og kommunenummer er ikke nok for Storgata 1 i Vågan
  for (const r of [await eiendom('Storgata 1, Vågan'), await eiendom('Storgata 1', { kommunenummer: '1865' })]) {
    assert.equal(r.status, 400);
    assert.deepEqual(steder((await r.json()).kandidater), ['Storgata 1, 8300 SVOLVÆR', 'Storgata 1, 8310 KABELVÅG']);
  }
  const oppslag = [
    [await eiendom('Storgata 1, Svolvær'), '8300'],
    [await eiendom('Storgata 1, 8310 Kabelvåg'), '8310'],
    [await eiendom('Storgata 1', { postnummer: '8310' }), '8310'],
    [await eiendom('Storgata 1', { postnummer: '8300', kommunenummer: '1865' }), '8300'],
  ];
  for (const [r, postnummer] of oppslag) {
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.meta.postnummer, postnummer);
    assert.equal(d.meta.kommunenummer, '1865');
  }
  // Postnummer og poststed som ikke hører sammen, gir ikke treff. Forslagene er adressen der noe av stedet stemmer
  const feil = await eiendom('Storgata 1, 8300 Kabelvåg');
  assert.equal(feil.status, 404);
  assert.deepEqual(steder((await feil.json()).kandidater).slice(0, 2), ['Storgata 1, 8300 SVOLVÆR', 'Storgata 1, 8310 KABELVÅG']);
  assert.equal((await eiendom('Storgata 1, 8300 Svolvær', { postnummer: '8310' })).status, 404);
});

// Slår opp en adresse som skal gi 404, og gir kandidatene
async function forslag(adresse, filter = {}) {
  const r = await eiendom(adresse, filter);
  assert.equal(r.status, 404, adresse);
  const d = await r.json();
  assert.equal(d.feil, 'Ingen adressetreff');
  return steder(d.kandidater ?? []);
}

// Slår opp en adresse som skal gi 200, og gir adressen, postnummeret og om treffet var eksakt
async function treff(adresse, filter = {}) {
  const r = await eiendom(adresse, filter);
  const d = await r.json();
  assert.equal(r.status, 200, `${adresse}: ${JSON.stringify(d).slice(0, 300)}`);
  return [d.meta.adresse, d.meta.postnummer, d.meta.eksaktTreff];
}

test('API-et gjetter ikke: en adresse som bare ligner, gir 404 med forslag', async () => {
  // Husnummeret finnes bare med bokstav
  assert.deepEqual(await forslag('Markveien 1, Oslo'), ['Markveien 1A, 0554 OSLO', 'Markveien 1B, 0554 OSLO']);
  // Skrivefeil: forslagene kommer fra et søk som tåler skrivefeil
  assert.deepEqual(await forslag('Stogata 1, Elverum'), ['Storgata 1, 2408 ELVERUM']);
  assert.deepEqual(await forslag('Storgata 1, Elverun'), ['Storgata 1, 2408 ELVERUM']);
  // Ingenting som ligner
  assert.deepEqual(await forslag('Finnesikke 99, Ingensteds'), []);
});

test('annen skrivemåte av samme adresse gir treff når bare én adresse passer', async () => {
  // Endelsen i gatenavnet
  // (Storgata 1 i Oslo slås ikke opp her. Den skal ikke ligge i cachen når testen av et fullt oppslag kjører.)
  assert.deepEqual(await treff('Storgaten 15, Oslo'), ['Storgata 15', '0155', false]);
  assert.deepEqual(await treff('Kirkevegen 1, Oslo'), ['Kirkeveien 1', '0266', false]);
  assert.deepEqual(await treff('Kirkeveien 1, Lødingen'), ['Kirkevegen 1', '8410', false]);
  // Forkortelser, også uten mellomrom foran husnummeret og som eget ord
  assert.deepEqual(await treff('Storgt. 11, Oslo'), ['Storgata 11', '0155', false]);
  assert.deepEqual(await treff('Storgt.17, Oslo'), ['Storgata 17', '0155', false]);
  assert.deepEqual(await treff('Kirkevn. 1, 0266'), ['Kirkeveien 1', '0266', false]);
  assert.deepEqual(await treff('Kirke vn. 1, Oslo'), ['Kirkeveien 1', '0266', false]);
  assert.deepEqual(await treff('Karl Johans gt 1, 0154'), ['Karl Johans gate 1', '0154', false]);
  // Forkortelser gjelder bare gatenavnet: «Hov.» er stedet Hov, ikke «Hovei»
  assert.deepEqual(await treff('Kirkevegen 3, Hov.'), ['Kirkeveien 3', '2860', false]);
  // Navnet i ett eller to ord
  assert.deepEqual(await treff('Karl Johansgate 1, Oslo'), ['Karl Johans gate 1', '0154', false]);
  assert.deepEqual(await treff('Kongens gate 1, Åndalsnes'), ['Kongensgate 1', '6300', false]);
  // Aksenter, og æ, ø og å skrevet uten
  assert.deepEqual(await treff('Bygdoy alle 5, Oslo'), ['Bygdøy allé 5', '0257', false]);
  assert.deepEqual(await treff('Gronnegata 1, Tromso'), ['Grønnegata 1', '9008', false]);
  assert.deepEqual(await treff('Grønnegata 1, Tromsoe'), ['Grønnegata 1', '9008', false]);
  assert.deepEqual(await treff('Storgata 1, Kabelvag'), ['Storgata 1', '8310', false]);
  assert.deepEqual(await treff('Kongensgate 1, Aandalsnes'), ['Kongensgate 1', '6300', false]);
  // Tilleggsnavnet kan stå først
  assert.deepEqual(await treff('Torvet, Storgaten 8A, Kragerø'), ['Torvet, Storgata 8A', '3770', false]);
  // Med postnummer som parameter
  assert.deepEqual(await treff('Storgaten 12', { postnummer: '0155' }), ['Storgata 12', '0155', false]);
  // Langveien 3 finnes 1100 steder, men i Bygd5 bare én gang. Kontrollen av området viser det.
  assert.deepEqual(await treff('Langvegen 3, Bygd5'), ['Langveien 3', '1005', false]);
  // Skrevet nøyaktig slik registeret har den: eksaktTreff er true
  assert.deepEqual(await treff('Storgata 13, Oslo'), ['Storgata 13', '0155', true]);
  // Finnes adressen slik den er skrevet, er det den, selv om en annen skrivemåte også finnes (Svelvik er i Drammen)
  assert.deepEqual(await treff('Storgaten 10, Drammen'), ['Storgaten 10', '3060', true]);
});

test('annen skrivemåte som kan være flere adresser, gir 400 med kandidatene', async () => {
  const kandidater = async adresse => {
    const r = await eiendom(adresse);
    assert.equal(r.status, 400, adresse);
    const d = await r.json();
    assert.equal(d.feil, 'Adressen kan være flere adresser');
    assert.match(d.hjelp, /Velg en av kandidatene/);
    return d;
  };
  // Storgaten 10 i Svelvik er samme navn med en annen endelse. Øvre og Nedre Storgate har flere ord i navnet,
  // men kan være det som er ment.
  let d = await kandidater('Storgate 10, Drammen');
  assert.deepEqual(steder(d.kandidater), ['Storgaten 10, 3060 SVELVIK', 'Øvre Storgate 10, 3018 DRAMMEN', 'Nedre Storgate 10, 3015 DRAMMEN']);
  assert.equal(d.antall, 3);
  d = await kandidater('Storgata 1, Vagan');
  assert.deepEqual(steder(d.kandidater), ['Storgata 1, 8300 SVOLVÆR', 'Storgata 1, 8310 KABELVÅG']);
  d = await kandidater('Kirkevegen 5, Oslo');
  assert.deepEqual(steder(d.kandidater), ['Kirkeveien 5, 0266 OSLO', 'Gamle Kirkevei 5, 0377 OSLO']);
  // Samme navn i ett og to ord, i samme by
  d = await kandidater('Nygata 3, Bergen');
  assert.deepEqual(steder(d.kandidater).sort(), ['Ny gate 3, 5015 BERGEN', 'Nygaten 3, 5015 BERGEN']);
  // Søkene på navnet finner bare Øvreveien 8E. Kontrollen av området finner også Øvre vei 8E.
  kall.length = 0;
  d = await kandidater('Ovrevegen 8E, Langhus');
  assert.deepEqual(steder(d.kandidater).sort(), ['Øvre vei 8E, 1405 LANGHUS', 'Øvreveien 8E, 1405 LANGHUS']);
  assert.ok(adressesok().some(q => q.poststed === 'LANGHUS' && q.nummer === '8' && q.bokstav === 'E'), 'området er kontrollert');
  // Uten sted: alle Storgata 1, og antallet er ukjent (hele landet kontrolleres ikke)
  d = await kandidater('Storgaten 1');
  assert.equal(d.kandidater.length, 6);
  assert.equal('antall' in d, false);
});

test('annen skrivemåte blir bare forslag når det ikke er sikkert', async () => {
  // Bare navn med flere ord passer: Kirkeveien 1 finnes ikke i Kristiansand
  assert.deepEqual(await forslag('Kirkeveien 1, Kristiansand'), ['Oddernes kirkevei 1, 4630 KRISTIANSAND S', 'Greipstad gamle kirkeveg 1, 4645 NODELAND']);
  // «Gate» alene er ikke et navn. Karl Johans gate 1 er et forslag, men gjør ikke «Gate 1, Oslo» til en adresse
  assert.deepEqual(await forslag('Gate 1, Oslo'), ['Karl Johans gate 1, 0154 OSLO']);
  // Uten sted kan det finnes en adresse med samme navn et annet sted i landet
  assert.deepEqual(await forslag('Bygdoy alle 5'), ['Bygdøy allé 5, 0257 OSLO']);
  assert.deepEqual(await forslag('Karl Johans gt 1'), ['Karl Johans gate 1, 0154 OSLO']);
  // Kontrollen av området svarer ikke, eller det finnes for mange adresser med husnummeret der
  for (const grunn of ['omraade', 'mange']) {
    nede.add(grunn);
    try {
      assert.deepEqual((await forslag(`Storgaten ${grunn === 'omraade' ? 14 : 18}, Oslo`))[0], `Storgata ${grunn === 'omraade' ? 14 : 18}, 0155 OSLO`);
    } finally { nede.clear(); }
  }
  // Søket som tåler skrivefeil, svarer ikke: det gjør ingenting, for kontrollen av området avgjør
  nede.add('uklart');
  try {
    assert.deepEqual(await treff('Storgaten 19, Oslo'), ['Storgata 19', '0155', false]);
  } finally { nede.clear(); }
  // Skrivefeil i navnet er alltid bare forslag
  assert.equal((await forslag('Stogata 1, Kabelvåg'))[0], 'Storgata 1, 8310 KABELVÅG');
  // Æ, ø og å som er skrevet, må stå i registeret også: Åsveien er ikke Asveien
  assert.deepEqual(await forslag('Åsveien 2, Ski'), ['Asveien 2, 1400 SKI']);
  assert.deepEqual(await treff('Asveien 2, Ski'), ['Asveien 2', '1400', true]);
  // «Strandv.» kan være Strandveien og Strandvika: alle navn som begynner slik, teller
  const strand = await eiendom('Strandv. 1, Oslo');
  assert.equal(strand.status, 400);
  assert.deepEqual(steder((await strand.json()).kandidater).sort(), ['Strandveien 1, 0250 OSLO', 'Strandvika 1, 0250 OSLO']);
  assert.deepEqual(await treff('Strandvn. 1, Oslo'), ['Strandveien 1', '0250', false]);   // vn. er bare vei
  // Med punktum er «Kirkev.» en forkortelse, uten er det ikke. Cachen skiller dem.
  assert.equal((await eiendom('Kirkev 1, Oslo')).status, 404);
  assert.deepEqual(await treff('Kirkev. 1, Oslo'), ['Kirkeveien 1', '0266', false]);
  assert.equal((await eiendom('Kirkev 1, Oslo')).status, 404);
});

test('bolignummer tas bort', async () => {
  kall.length = 0;
  assert.deepEqual(await treff('Storgata 9 H0201, 0155 Oslo'), ['Storgata 9', '0155', true]);
  assert.deepEqual(adressesok(), [{ adressenavn: 'storgata', nummer: '9', bokstav: '' }]);
  // En annen leilighet i samme bygning er samme adresse, og hentes fra cachen
  for (const adresse of ['Storgata 9, U0101, 0155 Oslo', 'Storgata 9 (H0201), 0155 Oslo', 'Storgata 9, 0155 Oslo, H0201.']) {
    const r = await eiendom(adresse);
    assert.equal((await r.json()).meta.cachet, true, adresse);
  }
  // Med mellomrom er det husbokstav og postnummer: Storgata 1 H, 0155 finnes ikke
  assert.equal((await eiendom('Storgata 1 H 0155 Oslo')).status, 404);
});

test('husnummeret må være husnummeret, ikke et annet tall i adressen', async () => {
  // Fritekstsøket i registeret gir også Storgata 12 i Elverum, fordi bruksnummeret der er 1
  const d = await (await eiendom('Storgata 1, Elverum')).json();
  assert.equal(d.meta.adresse, 'Storgata 1');
  assert.equal(d.meta.postnummer, '2408');
  assert.deepEqual([d.matrikkel.gardsnummer, d.matrikkel.bruksnummer], [28, 74]);

  // Storgata 1 i Oslo har bruksnummer 619, og i Elverum 74. Det gjør dem ikke til Storgata 619 og Storgata 74
  for (const adresse of ['Storgata 619, Oslo', 'Storgata 74, Elverum']) {
    const r = await eiendom(adresse);
    assert.equal(r.status, 404, adresse);
    assert.equal((await r.json()).kandidater, undefined, adresse);
  }

  // Dalveien 7 i Testby blir funnet selv om 120 andre adresser i gata har bruksnummer 7 og står foran i registeret
  kall.length = 0;
  const dal = await eiendom('Dalveien 7, 6999 Testby');
  assert.equal(dal.status, 200);
  assert.equal((await dal.json()).meta.adresse, 'Dalveien 7');
  assert.deepEqual(adressesok(), [{ adressenavn: 'dalveien', nummer: '7', bokstav: '' }]);
});

test('«4 i Bergen» kan være husnummer 4 i Bergen eller husnummer 4I', async () => {
  // Begge finnes i Myrveien: ikke entydig
  const begge = await eiendom('Myrveien 4 i Bergen');
  assert.equal(begge.status, 400);
  assert.deepEqual(steder((await begge.json()).kandidater), ['Myrveien 4, 5099 BERGEN', 'Myrveien 4I, 5099 BERGEN']);
  // Skrevet uten mellomrom er det bare bokstaven, og med komma bare stedet
  assert.equal((await (await eiendom('Myrveien 4I, Bergen')).json()).meta.adresse, 'Myrveien 4I');
  assert.equal((await (await eiendom('Myrveien 4, Bergen')).json()).meta.adresse, 'Myrveien 4');
  // Bare den ene finnes
  assert.equal((await (await eiendom('Bakken 4 i Bergen')).json()).meta.adresse, 'Bakken 4');
  assert.equal((await (await eiendom('Haugen 7 i Bergen')).json()).meta.adresse, 'Haugen 7I');
  // Fyllord teller ikke: «i», «kommune» og «Norge»
  const oslo = await (await eiendom('Storgata 7 i Oslo kommune, Norge.')).json();
  assert.equal(oslo.meta.adresse, 'Storgata 7');
  assert.equal(oslo.meta.postnummer, '0155');
});

test('stedet må være hele navnet på poststedet eller kommunen', async () => {
  const postnummer = async adresse => {
    const r = await eiendom(adresse);
    assert.equal(r.status, 200, adresse);
    return (await r.json()).meta.postnummer;
  };
  assert.equal(await postnummer('Storgata 1, Mo i Rana'), '8610');
  assert.equal(await postnummer('Storgata 1, Rana'), '8610');             // kommunen
  assert.equal(await postnummer('Storgata 1, 8610 Mo i Rana, Rana'), '8610');
  assert.equal(await postnummer('Storgata 1, Kristiansund N'), '6509');   // poststedet
  assert.equal(await postnummer('Storgata 1, Kristiansund'), '6509');     // kommunen
  // «Mo» og «N» er bare deler av et navn. Det er ikke nok
  for (const adresse of ['Storgata 1, Mo', 'Storgata 1, N', 'Storgata 1, Kristiansund Mo']) {
    assert.equal((await eiendom(adresse)).status, 404, adresse);
  }
  // Sammensatt å (a + ring) er samme bokstav som å
  assert.equal(await postnummer('Storgata 1, Kabelva\u030ag'), '8310');
});

test('adresse valgt fra en liste: adressetekst med postnummer og kommunenummer', async () => {
  kall.length = 0;
  const valgt = await eiendom('Torvet, Storgata 8A', { postnummer: '3770', kommunenummer: '4014' });
  assert.equal(valgt.status, 200);
  assert.equal((await valgt.json()).meta.adresse, 'Torvet, Storgata 8A');
  assert.deepEqual(adressesok(), [{ adressenavn: 'storgata', nummer: '8', bokstav: 'A', kommunenummer: '4014', postnummer: '3770' }]);

  // Tilleggsnavnet kan utelates. Svaret har adressen slik den står i registeret
  const uten = await (await eiendom('Storgata 8A, Kragerø')).json();
  assert.equal(uten.meta.adresse, 'Torvet, Storgata 8A');

  // Matrikkeladresse: en eiendom uten gateadresse
  const gard = await eiendom('Flaga, 12/5', { postnummer: '5708', kommunenummer: '4621' });
  assert.equal(gard.status, 200);
  const d = await gard.json();
  assert.equal(d.meta.adresse, 'Flaga, 12/5');
  assert.deepEqual([d.matrikkel.gardsnummer, d.matrikkel.bruksnummer], [12, 5]);

  const flere = await eiendom('12/5');
  assert.equal(flere.status, 400);
  assert.deepEqual(steder((await flere.json()).kandidater), ['Flaga, 12/5, 5708 VOSS', '12/5, 9692 MÅSØY']);
  assert.equal((await (await eiendom('12/5 Voss')).json()).meta.adresse, 'Flaga, 12/5');
  // Med postnummer i stedet for sted. «12/5 5708» er ikke gate 12/5 med husnummer 5708
  assert.equal((await (await eiendom('12/5, 5708')).json()).meta.adresse, 'Flaga, 12/5');
  assert.equal((await (await eiendom('12/5 9692 Måsøy')).json()).meta.postnummer, '9692');
});

test('mange treff: antallet oppgis bare når registeret har gitt alle', async () => {
  // Fjellveien 7 finnes i 120 kommuner. Svaret har ti kandidater, og sier hvor mange som finnes
  const mange = await (await eiendom('Fjellveien 7')).json();
  assert.equal(mange.antall, 120);
  assert.equal(mange.kandidater.length, 10);

  // Langveien 3 finnes 1100 steder, og registeret gir høyst 1000 i ett svar. Da er antallet ukjent
  const r = await eiendom('Langveien 3');
  assert.equal(r.status, 400);
  const d = await r.json();
  assert.equal('antall' in d, false);
  assert.equal(d.kandidater.length, 10);
  // Med postnummer er den entydig
  assert.equal((await eiendom('Langveien 3', { postnummer: '1500' })).status, 200);

  // Matrikkeladressen 9/9 i Storby er entydig, selv om fritekstsøket gir flere løse treff enn det henter.
  // Det kontrolleres med et eget søk på adresseteksten.
  kall.length = 0;
  const en = await eiendom('9/9 Storby');
  assert.equal(en.status, 200);
  assert.equal((await en.json()).meta.adresse, '9/9');
  assert.deepEqual(adressesok(), [{ sok: '9/9 storby' }, { adressetekst: '9/9 storby' }, { adressetekst: '9/9' }]);
});

test('ugyldige parametre gir 400, og stopper ikke serveren', async () => {
  const feil = async sti => {
    const r = await hent(sti, medNokkel);
    assert.equal(r.status, 400, sti);
    return (await r.json()).feil;
  };
  assert.match(await feil('/eiendom?adresse=Storgata+1&postnummer=155'), /postnummer må være fire siffer/);
  assert.match(await feil('/eiendom?adresse=Storgata+1&kommunenummer=Oslo'), /kommunenummer må være fire siffer/);
  assert.match(await feil('/eiendom?adresse='), /Mangler adresse/);
  assert.match(await feil('/eiendom?adresse=' + encodeURIComponent(' , ; . ')), /Mangler adresse/);   // bare tegn
  assert.match(await feil('/eiendom?adresse=' + 'a'.repeat(201)), /høyst 200 tegn/);
  // Samme parameter to ganger ga tidligere en feil som stoppet hele serveren
  assert.match(await feil('/eiendom?adresse=Storgata+1&adresse=Storgata+2'), /bare oppgis én gang/);
  assert.match(await feil('/eiendom?adresse=Storgata+1&postnummer=0155&postnummer=8300'), /bare oppgis én gang/);
  assert.match(await feil('/eiendom?adresse[x]=Storgata+1'), /bare oppgis én gang/);
  assert.equal((await hent('/helse')).status, 200);
});

test('bare fyllord eller bare tall gir ingen søk i registeret', async () => {
  kall.length = 0;
  for (const adresse of ['Norge', 'i kommune', '5', 'Norge 5', '0155', '4 i', '1 2 3', 'Oslo kommune, Norge']) {
    const r = await eiendom(adresse);
    assert.equal(r.status, 404, adresse);
  }
  // Bare den siste har noe å søke på, og den søkes som «oslo»
  assert.deepEqual(adressesok(), [{ sok: 'oslo' }, { adressetekst: 'oslo kommune, norge' }]);

  // Et husnummer med mer enn fem siffer er ikke et husnummer. Registeret svarer med feil på lange tall
  kall.length = 0;
  assert.equal((await eiendom('Storgata 99999999999999999999')).status, 404);
  assert.deepEqual(adressesok(), [{ sok: 'storgata 99999999999999999999' }, { adressetekst: 'storgata 99999999999999999999' }]);
});

test('adresseregisteret svarer ikke: 502, og ingen gjetting', async () => {
  nede.add('adresser');
  try {
    const r = await eiendom('Storgata 5, Oslo');
    assert.equal(r.status, 502);
    assert.equal((await r.json()).feil, 'Adresseoppslag feilet');
  } finally { nede.clear(); }
});

test('samme adresse skrevet på en annen måte hentes fra cachen', async () => {
  assert.equal((await (await eiendom('Storgata 6, 0155 Oslo')).json()).meta.cachet, false);
  kall.length = 0;
  const d = await (await eiendom('  STORGATA 6,0155   OSLO ')).json();
  assert.equal(d.meta.cachet, true);
  assert.equal(d.meta.adresse, 'Storgata 6');
  assert.deepEqual(adressesok(), []);
});

test('fullt oppslag setter sammen alle kildene', async () => {
  kall.length = 0;
  const r = await hent('/eiendom?adresse=Storgata+1,+Oslo', medNokkel);
  assert.equal(r.status, 200);
  const d = await r.json();

  assert.equal(d.meta.adresse, 'Storgata 1');
  assert.equal(d.meta.kommunenummer, '0301');
  assert.match(d.meta.kilder, /Kartverket/);
  assert.deepEqual(d.matrikkel, { gardsnummer: 208, bruksnummer: 619, seksjonsnummer: null, festenummer: 0, matrikkelnummer: '208/619' });

  assert.equal(d.teig.arealM2, 790);
  assert.equal(d.reguleringsplan.plannavn, 'Midtbyplanen');
  assert.equal(d.losmasser.type, 'Fyllmasse (antropogent materiale)');
  assert.equal(d.berggrunn.bergart, 'Granittisk gneis');
  assert.equal(d.skredfare.funnet, true);
  assert.equal(d.skredfare.kartlagt, true);
  assert.equal(d.skredfare.soner[0].type, 'Skred i bratt terreng');
  assert.equal(d.skredfare.soner[1].type, 'Kvikkleiresone (Hafella)');
  assert.equal(d.flomsone.soner[0].navn, '200-årsflom');
  assert.equal(d.jordskredvarsel.funnet, true);

  // Teigen slås opp på adressens matrikkelnummer, i Oslos offisielle UTM-sone
  const teig = kall.find(u => u.pathname === '/eiendom/v1/geokoding');
  assert.equal(teig.searchParams.get('kommunenummer'), '0301');
  assert.equal(teig.searchParams.get('gardsnummer'), '208');
  assert.equal(teig.searchParams.get('bruksnummer'), '619');
  assert.equal(teig.searchParams.get('utkoordsys'), '25832');
  // Ingen kall til de gamle, døde adressene (varselet kan være cachet fra en tidligere test)
  const kjente = ['api01.nve.no', 'geo.ngu.no', 'kart.nve.no', 'nap.ft.dibk.no', 'ws.geonorge.no'];
  assert.deepEqual(kall.map(u => u.hostname).filter(h => !kjente.includes(h)), []);
  assert.ok(kall.some(u => u.hostname === 'kart.nve.no') && kall.some(u => u.hostname === 'geo.ngu.no'));
});

test('død faresonetjeneste gir feil, ikke «ingen fare»', async () => {
  nede.add('Skredfaresoner3');
  nede.add('Flomsoner2');
  try {
    const d = await (await hent('/eiendom?adresse=Storgata+2,+Oslo', medNokkel)).json();
    assert.equal(d.skredfare.feil, true);
    assert.equal(d.skredfare.funnet, false);
    assert.equal(d.flomsone.feil, true);
    assert.equal(d.teig.arealM2, 790);   // resten av svaret er upåvirket
  } finally { nede.clear(); }
});

test('én aktsomhetskilde nede gir ufullstendig svar med navn på kilden', async () => {
  nede.add('SkredSteinAktR');
  try {
    const d = await (await hent('/eiendom?adresse=Storgata+3,+Oslo', medNokkel)).json();
    assert.equal(d.skredfare.funnet, true);
    assert.equal(d.skredfare.ufullstendig, true);
    assert.deepEqual(d.skredfare.mangler, ['Aktsomhetskart steinsprang']);
    assert.deepEqual(d.skredfare.aktsomhet, ['Snøskred', 'Kvikkleireskred']);
  } finally { nede.clear(); }
});

test('reguleringsplan er slått av uten PLAN_AKTIV', async () => {
  delete process.env.PLAN_AKTIV;
  try {
    const d = await (await hent('/eiendom?adresse=Storgata+4,+Oslo', medNokkel)).json();
    assert.deepEqual(d.reguleringsplan, { funnet: false, lenke: null, utilgjengelig: true });
  } finally { process.env.PLAN_AKTIV = 'true'; }
});

test('admin krever riktig nøkkel og viser om lagringen er persistent', async () => {
  assert.equal((await hent('/admin/status')).status, 403);
  const r = await hent('/admin/status', { 'X-Admin-Key': 'lokal-admin' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).persistentLagring, false);   // ingen volum i testmiljøet
});

test('CORS: bare tillatte domener får CORS-header, og avvisning gir ikke 500', async () => {
  const tillatt = await hent('/helse', { Origin: 'https://tillatt.example' });
  assert.equal(tillatt.headers.get('access-control-allow-origin'), 'https://tillatt.example');

  const avvist = await hent('/helse', { Origin: 'https://ukjent.example' });
  assert.equal(avvist.status, 200);
  assert.equal(avvist.headers.get('access-control-allow-origin'), null);
});
