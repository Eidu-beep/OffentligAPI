// Tester at tolkerne forstår svarene fra de ekte tjenestene. Kjør med: npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { tolkSkredfare, tolkFlomsone, tolkJordskredvarsel, norskTid } from '../src/services/nve.js';
import { gmlObjekter, tolkLosmasse, tolkBerggrunn } from '../src/services/ngu.js';
import { tolkPlan } from '../src/services/plan.js';
import { tolkTeigerForMatrikkel, tolkTeigVedPunkt } from '../src/services/teig.js';
import { tolkSoketekst, ord, lesemaater, passer } from '../src/services/adresse.js';
import { wmsFeatureInfoUrl, arcgisIdentifyUrl, hentJson } from '../src/utils/wms.js';
import { polygonAreal, utmEpsgForKommune, wgs84TilUtm33 } from '../src/utils/geo.js';
import * as svar from '../testdata/svar.js';

const treff = navn => svar.NVE[navn].results;

test('adresse: søketeksten deles i gate, nummer, bokstav og stedsord', () => {
  const del = t => { const d = tolkSoketekst(t); return d && [d.adressenavn, d.nummer, d.bokstav, d.stedsord.join(' ')]; };
  assert.deepEqual(del('karl johans gate 1, oslo'), ['karl johans gate', '1', null, 'oslo']);
  assert.deepEqual(del('storgata 1 oslo'), ['storgata', '1', null, 'oslo']);
  assert.deepEqual(del('saudalen 120e, morvik'), ['saudalen', '120', 'E', 'morvik']);
  assert.deepEqual(del('storgata 12 b, oslo'), ['storgata', '12', 'B', 'oslo']);
  assert.deepEqual(del('storgata 1, 0155 oslo'), ['storgata', '1', null, '0155 oslo']);
  assert.deepEqual(del('st. olavs gate 2, oslo kommune'), ['st. olavs gate', '2', null, 'oslo']);
  assert.deepEqual(del('nordgardsleitet 82'), ['nordgardsleitet', '82', null, '']);
  assert.deepEqual(del('storgata 1, 8610 mo i rana, norge'), ['storgata', '1', null, '8610 mo rana']);   // uten fyllord
  // Tilleggsnavn foran gatenavnet er ikke en del av gatenavnet
  assert.deepEqual(del('torvet, storgata 8a, kragerø'), ['storgata', '8', 'A', 'kragerø']);
  // «H0201» er et bolignummer, ikke husbokstaven H
  assert.equal(tolkSoketekst('storgata 1 h0201, oslo').bokstav, null);
  // «4 i bergen»: i-en er ikke en sikker husbokstav. «4i» er det
  assert.deepEqual(del('myrveien 4 i bergen'), ['myrveien', '4', null, 'bergen']);
  assert.equal(tolkSoketekst('myrveien 4 i bergen').uklarI, true);
  assert.deepEqual(del('myrveien 4i bergen'), ['myrveien', '4', 'I', 'bergen']);
  assert.equal(tolkSoketekst('myrveien 4i bergen').uklarI, false);
  assert.equal(tolkSoketekst('myrveien 4 indre østfold').uklarI, false);
  assert.equal(del('slottet oslo'), null);   // uten husnummer brukes fritekstsøk
  assert.equal(del('flaga, 12/5'), null);    // matrikkeladresse: gårds- og bruksnummer, ikke gate og husnummer
  assert.equal(del('163/85-1'), null);
  assert.equal(del(', 1'), null);            // mangler gatenavn
  assert.equal(del('12/5 5708'), null);      // gårds- og bruksnummer med postnummer, ikke gate «12/5» nummer 5708
  assert.equal(del('storgata 123456'), null); // et husnummer har høyst fem siffer
});

test('adresse: ord som sammenlignes, uavhengig av skrivemåte', () => {
  assert.deepEqual(ord('Storgata 12 B, 0155 Oslo'), ['storgata', '12b', '0155', 'oslo']);
  assert.deepEqual(ord('STORGATA 12B,0155  OSLO'), ['storgata', '12b', '0155', 'oslo']);
  assert.deepEqual(ord('St. Olavs gate 2'), ['st', 'olavs', 'gate', '2']);
  assert.deepEqual(ord('St.Croix gate 1'), ['st.croix', 'gate', '1']);   // ett ord i registeret, og derfor her
  assert.deepEqual(ord('Jolly Kramer-Johansens gate 1'), ['jolly', 'kramer', 'johansens', 'gate', '1']);
  assert.deepEqual(ord('Flaga, 12/5'), ['flaga', '12/5']);
  assert.deepEqual(ord('Storgata 12 Bergen'), ['storgata', '12', 'bergen']);   // B-en i Bergen er ikke en husbokstav
  assert.deepEqual(ord('Storgata 1, Kabelva\u030ag'), ['storgata', '1', 'kabelvåg']);   // sammensatt å
  assert.deepEqual(ord('...Storgata... 1.'), ['storgata', '1']);
  assert.deepEqual(ord(null), []);
  assert.deepEqual(ord(' , ; . - '), []);

  // «4 i» leses på to måter: husnummer 4 og ordet i, eller husnummer 4I
  assert.deepEqual(lesemaater('Myrveien 4 i Bergen'), [['myrveien', '4', 'i', 'bergen'], ['myrveien', '4i', 'bergen']]);
  assert.deepEqual(lesemaater('Myrveien 4I, Bergen'), [['myrveien', '4i', 'bergen']]);
  assert.deepEqual(lesemaater('Storgata 1, Mo i Rana'), [['storgata', '1', 'mo', 'i', 'rana']]);

  // Lang tekst med mange punktum skal ikke ta tid (en tidligere utgave brukte kvadratisk tid)
  const start = Date.now();
  assert.deepEqual(ord('a' + '.'.repeat(500000) + 'a'), ['a' + '.'.repeat(500000) + 'a']);
  assert.ok(Date.now() - start < 500, `ord() brukte ${Date.now() - start} ms`);
});

test('adresse: et treff godtas bare når det er nøyaktig adressen det ble spurt om', () => {
  const svolvar = { adressetekst: 'Storgata 1', adressetekstutenadressetilleggsnavn: 'Storgata 1', postnummer: '8300', poststed: 'SVOLVÆR', kommunenavn: 'VÅGAN' };
  const torvet = { adressetekst: 'Torvet, Storgata 8A', adressetekstutenadressetilleggsnavn: 'Storgata 8A', postnummer: '3770', poststed: 'KRAGERØ', kommunenavn: 'KRAGERØ' };
  const rana = { adressetekst: 'Storgata 1', adressetekstutenadressetilleggsnavn: 'Storgata 1', postnummer: '8610', poststed: 'MO I RANA', kommunenavn: 'RANA' };
  const ja = (a, tekst) => assert.equal(passer(a, lesemaater(tekst)), true, tekst);
  const nei = (a, tekst) => assert.equal(passer(a, lesemaater(tekst)), false, tekst);

  ja(svolvar, 'Storgata 1');
  ja(svolvar, 'storgata 1, 8300 svolvær');
  ja(svolvar, 'Storgata 1 Vågan');
  ja(svolvar, 'Storgata 1, Svolvær, Vågan kommune, Norge');
  ja(rana, 'Storgata 1, Mo i Rana');
  ja(rana, 'Storgata 1, Rana');            // kommunen
  ja(rana, 'Storgata 1 i Mo i Rana, Rana kommune');
  ja(rana, 'Storgata 1, 8610 Rana');
  ja(torvet, 'Storgata 8A, Kragerø');      // tilleggsnavnet kan utelates
  ja(torvet, 'Torvet, Storgata 8 a');

  nei(rana, 'Storgata 1, Mo');             // bare en del av poststedet
  nei(rana, 'Storgata 1, Mo Rana');
  nei(rana, 'Storgata 1, Rana Rana Rana'); // kommunenavnet kan ikke brukes flere ganger
  nei(svolvar, 'Storgata 1, Kabelvåg');    // annet sted
  nei(svolvar, 'Storgata 1, 8310 Svolvær'); // postnummeret hører ikke til adressen
  nei(svolvar, 'Storgata 10');             // annet husnummer
  nei(svolvar, 'Storgata 1B');
  nei(svolvar, 'Storgaten 1');             // annen form av navnet
  nei(svolvar, 'Nedre Storgata 1');
  nei(svolvar, 'Storgata');                // mangler husnummer
  nei(torvet, 'Storgata 8, Kragerø');
  nei(torvet, 'Havna, Storgata 8A');       // feil tilleggsnavn
});

test('skredfare: i faresone, strengeste klasse oppgis', () => {
  const r = tolkSkredfare({
    faresoner: treff('Skredfaresoner3'), kvikkleire: [], snoskred: treff('SnoskredAktsomhet'),
    steinsprang: treff('SkredSteinAktR'), jordflom: treff('JordFlomskredAktsomhet'), kvikkAkt: treff('KvikkleireskredAktsomhet'),
  });
  assert.equal(r.funnet, true);
  assert.equal(r.kartlagt, true);
  assert.deepEqual(r.soner, [{ type: 'Skred i bratt terreng', fareklasse: 'Årlig sannsynlighet ≥ 1/100', intervall: '100 år' }]);
  assert.deepEqual(r.aktsomhet, ['Snøskred', 'Steinsprang', 'Kvikkleireskred']);
  assert.equal(r.rapport, 'https://publikasjoner.nve.no/eksternrapport/2025/eksternrapport2025_18.pdf');
});

test('skredfare: kartlagt område uten faresone er ikke det samme som ikke kartlagt', () => {
  const kartlagt = tolkSkredfare({ faresoner: [treff('Skredfaresoner3')[0]] });
  assert.deepEqual({ funnet: kartlagt.funnet, kartlagt: kartlagt.kartlagt }, { funnet: false, kartlagt: true });

  const ukartlagt = tolkSkredfare({ faresoner: [] });
  assert.deepEqual(ukartlagt, { funnet: false, kartlagt: false, soner: [], aktsomhet: [], rapport: null });
});

test('skredfare: sone som bare gjelder dersom skogen fjernes', () => {
  const r = tolkSkredfare({ faresoner: [{ layerId: 0, attributes: {} }, { layerId: 8, attributes: {} }, { layerId: 29, attributes: {} }] });
  assert.deepEqual(r.soner.map(s => `${s.type}: ${s.intervall}`), [
    'Skred i bratt terreng: 5000 år',
    'Skred i bratt terreng dersom skogen fjernes: 1000 år',
  ]);
});

test('skredfare: kvikkleiresone', () => {
  const r = tolkSkredfare({ faresoner: [], kvikkleire: treff('SkredKvikkleire2'), kvikkAkt: treff('KvikkleireskredAktsomhet') });
  assert.equal(r.funnet, true);
  assert.deepEqual(r.soner, [{ type: 'Kvikkleiresone (Hafella)', fareklasse: 'Faregrad høy, Risikoklasse 3', intervall: null }]);
  assert.deepEqual(r.aktsomhet, ['Kvikkleireskred']);
});

test('flomsone: soner sorteres etter gjentaksintervall, klimasoner til slutt', () => {
  const r = tolkFlomsone({ flomsoner: treff('Flomsoner2'), aktsomhet: treff('Flomaktsomhet') });
  assert.equal(r.funnet, true);
  assert.equal(r.kartlagt, true);
  assert.deepEqual(r.soner, [
    { navn: '200-årsflom', intervall: '200 år', lavpunkt: false, klima: false },
    { navn: '1000-årsflom', intervall: '1000 år', lavpunkt: false, klima: false },
    { navn: '200-årsflom med klimapåslag', intervall: '200 år', lavpunkt: true, klima: true },
  ]);
  assert.equal(r.aktsomhet, true);
  assert.equal(r.aktsomhetDekning, true);
});

test('flomsone: ingen treff', () => {
  const r = tolkFlomsone({ flomsoner: [], aktsomhet: [treff('Flomaktsomhet')[1]] });
  assert.deepEqual(r, { funnet: false, kartlagt: false, soner: [], aktsomhet: false, aktsomhetDekning: true });
});

test('jordskredvarsel: velger varselet som gjelder nå, og tar med neste døgn', () => {
  const r = tolkJordskredvarsel(svar.VARSEL, '4601', '2026-10-03T22:11:26');
  assert.equal(r.funnet, true);
  assert.equal(r.aktsomhetsniva, 1);
  assert.equal(r.tekst, '1 – Grønt');
  assert.equal(r.dato, '2026-10-03');
  assert.equal(r.neste.aktsomhetsniva, 2);
  assert.equal(r.neste.tekst, '2 – Gult');
  assert.equal(r.neste.faretype, 'Jord- og flomskredfare');
});

test('jordskredvarsel: før kl. 07 gjelder fortsatt gårsdagens varsel', () => {
  const r = tolkJordskredvarsel(svar.VARSEL, '4601', '2026-10-04T03:00:00');
  assert.equal(r.dato, '2026-10-03');
  assert.equal(r.neste.dato, '2026-10-04');
});

test('jordskredvarsel: ukjent kommune og ugyldig svar gir «ikke tilgjengelig»', () => {
  assert.equal(tolkJordskredvarsel(svar.VARSEL_UKJENT_KOMMUNE, '9999', '2026-10-03T12:00:00').funnet, false);
  assert.equal(tolkJordskredvarsel({ Message: 'feil' }, '0301', '2026-10-03T12:00:00').funnet, false);
  assert.equal(tolkJordskredvarsel(svar.VARSEL, 4601, '2026-10-03T12:00:00').funnet, true);   // tall i stedet for tekst
});

test('norskTid gir norsk dato og klokkeslett, også over midnatt', () => {
  assert.deepEqual(norskTid(new Date('2026-10-03T22:30:15Z')), { dato: '2026-10-04', tidspunkt: '2026-10-04T00:30:15' });
  assert.deepEqual(norskTid(new Date('2026-01-15T12:00:00Z')), { dato: '2026-01-15', tidspunkt: '2026-01-15T13:00:00' });
});

test('løsmasser: GML fra NGU', () => {
  const r = tolkLosmasse(gmlObjekter(svar.LOSMASSE_GML));
  assert.equal(r.funnet, true);
  assert.equal(r.type, 'Fyllmasse (antropogent materiale)');
  assert.equal(r.kode, 120);
  assert.equal(r.malestokk, '1 : 50 000');
  assert.match(r.beskrivelse, /^Løsmasser som i hovedsak/);
});

test('løsmasser: tomt svar gir «ingen data», og svar som ikke er GML gir feil', () => {
  assert.deepEqual(tolkLosmasse(gmlObjekter(svar.TOM_GML)), { funnet: false });
  assert.throws(() => gmlObjekter('<HTML><HEAD><TITLE>MapServer Message</TITLE></HEAD></HTML>'), /ikke GML/);
});

test('berggrunn: regionalt nivå foretrekkes foran nasjonalt', () => {
  const objekter = gmlObjekter(svar.BERGGRUNN_GML);
  assert.equal(objekter.length, 2);
  const r = tolkBerggrunn(objekter);
  assert.equal(r.bergart, 'Granittisk gneis');
  assert.deepEqual(r.tilleggsbergarter, ['Amfibolitt', 'Amfibolgneis']);
  assert.equal(r.alder, 'Mesoproterozoikum - Ektas 4 (1250-1200 Ma)');
  assert.equal(r.tektoniskEnhet, 'Midtre kaledonsk dekkeserie');
  assert.equal(r.datagrunnlag, 'Bergartsflater (regionalt nivå, 1:250 000)');

  const bareNasjonal = tolkBerggrunn(objekter.filter(o => /nasjonal/.test(o.lag)));
  assert.equal(bareNasjonal.bergart, 'Metagabbro');
  assert.equal(bareNasjonal.alder, null);
});

test('reguleringsplan: koder oversettes til tekst', () => {
  const r = tolkPlan(svar.PLAN);
  assert.equal(r.funnet, true);
  assert.equal(r.plannavn, 'Midtbyplanen');
  assert.equal(r.planid, 'r0118');
  assert.equal(r.plantype, 'Eldre reguleringsplan');
  assert.equal(r.planstatus, 'Endelig vedtatt arealplan');
  assert.equal(r.ikrafttredelse, '1981-08-28');
  assert.equal(r.lenke, 'https://plandialog.isy.no/detailsplan/5001/r0118/True/False');
  assert.equal(r.antallPlaner, 1);
});

test('reguleringsplan: nyeste vedtatte plan først, og bare http-lenker slippes gjennom', () => {
  const plan = (navn, status, dato, link) => ({ properties: { plannavn: navn, plantype: '35', planstatus: status, ikrafttredelsesdato: dato, 'arealplanId.planidentifikasjon': navn, link } });
  const r = tolkPlan({ features: [
    plan('Forslag', '2', null, 'javascript:alert(1)'),
    plan('Gammel', '3', '1990-01-01Z', 'https://eksempel.no/gammel'),
    plan('Ny', '3', '2020-05-05Z', 'https://eksempel.no/ny'),
    plan('Ny', '3', '2020-05-05Z', 'https://eksempel.no/ny'),
  ] });
  assert.deepEqual(r.planer.map(p => p.plannavn), ['Ny', 'Gammel', 'Forslag']);
  assert.equal(r.plannavn, 'Ny');
  assert.equal(r.planer[2].lenke, null);
  assert.deepEqual(tolkPlan(svar.PLAN_TOM), { funnet: false, lenke: null, planer: [] });
  assert.throws(() => tolkPlan({ feil: true }), /Uventet svar/);
});

test('teig: areal beregnes fra teiggrensene', () => {
  const r = tolkTeigerForMatrikkel(svar.TEIG);
  assert.deepEqual(r, {
    funnet: true, matrikkelnummer: '208/619', gardsnummer: 208, bruksnummer: 619, arealM2: 790,
    'nøyaktighet': 'Gult – bør sjekkes', fellesTeig: false, antallTeiger: 1,
  });
});

test('teig: flere teiger summeres, og punktoppslag bruker bare den nærmeste', () => {
  const firkant = (x, y, side) => ({ type: 'Polygon', coordinates: [[[x, y], [x + side, y], [x + side, y + side], [x, y + side], [x, y]]] });
  const teig = (nr, hoved, meter, geometry) => ({ type: 'Feature', geometry, properties: { objekttype: 'Teig', matrikkelnummertekst: nr, 'hovedområde': hoved, meterFraPunkt: meter, 'nøyaktighetsklasseteig': 'Grønt' } });
  const data = { features: [teig('1/2', false, 0.8, firkant(0, 0, 10)), teig('1/1', true, 0, firkant(100, 100, 20))] };

  const alle = tolkTeigerForMatrikkel(data);
  assert.equal(alle.arealM2, 500);
  assert.equal(alle.antallTeiger, 2);
  assert.equal(alle.matrikkelnummer, '1/1');

  const naermest = tolkTeigVedPunkt(data);
  assert.equal(naermest.matrikkelnummer, '1/1');
  assert.equal(naermest.arealM2, 400);
  assert.equal(naermest['nøyaktighet'], 'Grønt – ok');

  assert.deepEqual(tolkTeigerForMatrikkel({ features: [] }), { funnet: false, antallTeiger: 0 });
});

test('areal: hull trekkes fra, og UTM-sone følger fylket', () => {
  const medHull = { type: 'Polygon', coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]],
  ] };
  assert.equal(polygonAreal(medHull), 96);
  assert.equal(polygonAreal({ type: 'MultiPolygon', coordinates: [medHull.coordinates, [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]]] }), 97);
  assert.equal(utmEpsgForKommune('0301'), 25832);
  assert.equal(utmEpsgForKommune('1804'), 25833);
  assert.equal(utmEpsgForKommune('5501'), 25833);
  assert.equal(utmEpsgForKommune('5607'), 25835);
});

test('URL-er: bare kjente verter, og riktige parametre', async () => {
  await assert.rejects(hentJson('https://gis3.nve.no/arcgis/rest/services'), /Ikke tillatt domene/);
  await assert.rejects(hentJson('http://kart.nve.no/enterprise/rest/services'), /Kun https/);

  const wms = new URL(wmsFeatureInfoUrl('https://geo.ngu.no/mapserver/LosmasserWMS2', 'Losmasse_flate', 59.913, 10.7479, { infoFormat: 'application/vnd.ogc.gml', maksTreff: 1 }));
  assert.equal(wms.searchParams.get('INFO_FORMAT'), 'application/vnd.ogc.gml');
  assert.equal(wms.searchParams.get('X'), '50');
  assert.equal(wms.searchParams.get('WIDTH'), '101');
  const [vest, sor, ost, nord] = wms.searchParams.get('BBOX').split(',').map(Number);
  assert.ok(vest < 10.7479 && 10.7479 < ost && sor < 59.913 && 59.913 < nord);
  assert.ok(Math.abs((nord - sor) * 111320 - 20) < 0.01);

  const { utmOst, utmNord } = wgs84TilUtm33(59.913006409365344, 10.74787104779588);
  assert.deepEqual([utmOst, utmNord], [262312, 6649360]);
  const arcgis = new URL(arcgisIdentifyUrl('https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer', 59.913006409365344, 10.74787104779588, 'all:0,17', 1));
  assert.equal(arcgis.pathname, '/enterprise/rest/services/Flomsoner2/MapServer/identify');
  assert.equal(arcgis.searchParams.get('geometry'), '262312,6649360');
  assert.equal(arcgis.searchParams.get('mapExtent'), '262262,6649310,262362,6649410');
  assert.equal(arcgis.searchParams.get('layers'), 'all:0,17');
});
