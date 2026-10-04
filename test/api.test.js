// Tester hele API-et mot etterlignede datakilder (ingen nettverk). Kjør med: npm test
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as svar from '../testdata/svar.js';

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
    const q = url.searchParams;
    if (q.get('sok') || q.get('adressenavn') !== 'storgata') return { adresser: [] };
    // «Morvik» er et poststed, ikke en kommune: treff først når det søkes på poststed
    if (q.get('kommunenavn') === 'morvik') return { adresser: [] };
    // Husnummeret styrer koordinat og matrikkel, slik at hver test får sin egen (ucachede) adresse
    const nr = Number(q.get('nummer'));
    const a = structuredClone(svar.ADRESSE);
    Object.assign(a.adresser[0], { nummer: nr, bokstav: q.get('bokstav') ?? '', bruksnummer: 619 + nr - 1 });
    a.adresser[0].representasjonspunkt.lat += (nr - 1) / 1000;
    return a;
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
const hent = (sti, headers = {}) => ekteFetch(`${base}${sti}`, { headers });
const medNokkel = { 'X-Api-Key': 'lokal-nokkel' };

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
  const r = await hent('/eiendom?adresse=' + encodeURIComponent('Storgata 12B, Morvik'), medNokkel);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).meta.adresse, 'Storgata 12B');

  const sok = kall.filter(u => u.pathname === '/adresser/v1/sok').map(u => Object.fromEntries(u.searchParams));
  assert.deepEqual(sok, [
    { treffPerSide: '5', adressenavn: 'storgata', nummer: '12', bokstav: 'B', kommunenavn: 'morvik' },
    { treffPerSide: '5', adressenavn: 'storgata', nummer: '12', bokstav: 'B', poststed: 'morvik' },
  ]);
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
