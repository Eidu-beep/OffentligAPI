// Testdata bygd på svar fra de ekte tjenestene 2026-10-03. Brukes av testene i test/-mappen,
// slik at tolkerne kan testes uten nettverk. Struktur og feltnavn er ekte. Lange svar er kortet
// ned, og enkelte verdier er tilpasset for å dekke flere tilfeller (for eksempel lavpunkt).

// ws.geonorge.no/adresser/v1/sok – Storgata 1, Oslo. Første adresse i testregisteret (adresseregister.js)
export const ADRESSE = {
  metadata: { treffPerSide: 5, side: 0, totaltAntallTreff: 1, viserFra: 0, viserTil: 5, asciiKompatibel: true },
  adresser: [{
    adressenavn: 'Storgata', adressetekst: 'Storgata 1', adressetilleggsnavn: null, adressekode: 17059,
    nummer: 1, bokstav: '', kommunenummer: '0301', kommunenavn: 'OSLO', gardsnummer: 208, bruksnummer: 619,
    festenummer: 0, undernummer: null, bruksenhetsnummer: [], objtype: 'Vegadresse', poststed: 'OSLO',
    postnummer: '0155', adressetekstutenadressetilleggsnavn: 'Storgata 1', stedfestingverifisert: true,
    representasjonspunkt: { epsg: 'EPSG:4258', lat: 59.913006409365344, lon: 10.74787104779588 },
    oppdateringsdato: '2026-03-26T19:41:05',
  }],
};

// ws.geonorge.no/eiendom/v1/geokoding?kommunenummer=0301&gardsnummer=208&bruksnummer=619&omrade=true&utkoordsys=25832
export const TEIG = {
  crs: { properties: { name: 'EPSG:25832' }, type: 'name' },
  features: [{
    geometry: {
      coordinates: [[
        [597715.44, 6643040.02], [597715.96, 6643039.78], [597727.36, 6643032.52], [597745.24, 6643014.39],
        [597729.62, 6643004.41], [597727.66, 6643003.79], [597705.02, 6643013.18], [597705.12, 6643013.45],
        [597712.57, 6643033.13], [597711.2, 6643033.56], [597712.13, 6643034.98], [597715.44, 6643040.02],
      ]],
      type: 'Polygon',
    },
    properties: {
      bruksnummer: 619, festenummer: 0, gardsnummer: 208, 'hovedområde': true, kommunenummer: '0301',
      lokalid: 291174146, matrikkelnummertekst: '208/619', 'nøyaktighetsklasseteig': 'Gult', objekttype: 'Teig',
      oppdateringsdato: '2020-06-16T07:19:19', seksjonsnummer: 0, teigmedflerematrikkelenheter: false,
      uregistrertjordsameie: false,
    },
    type: 'Feature',
  }],
  type: 'FeatureCollection',
};

// geo.ngu.no/mapserver/LosmasserWMS2 – GetFeatureInfo (GML), lag Losmasse_flate, Storgata 1 i Oslo
export const LOSMASSE_GML = `<?xml version="1.0" encoding="UTF-8"?>

<msGMLOutput
	 xmlns:gml="http://www.opengis.net/gml"
	 xmlns:xlink="http://www.w3.org/1999/xlink"
	 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<Losmasse_flate_layer>
		<Losmasse_flate_feature>
			<objectid>775121</objectid>
			<objekttype>LosmasseFlate</objekttype>
			<losmassetype>120</losmassetype>
			<losmassetype_tekst>Fyllmasse (antropogent materiale)</losmassetype_tekst>
			<losmassetype_definisjon>Løsmasser som i hovedsak er transportert og avsatt av mennesker. Løsmassetypen finnes ofte i områder med nyere bygningsmasse og ved store veganlegg.</losmassetype_definisjon>
			<egnetmaalestokk>50000</egnetmaalestokk>
			<egnetmaalestokk_formattert>1 : 50 000</egnetmaalestokk_formattert>
		</Losmasse_flate_feature>
	</Losmasse_flate_layer>
</msGMLOutput>
`;

// Samme tjeneste for et punkt uten data (i havet)
export const TOM_GML = `<?xml version="1.0" encoding="UTF-8"?>

<msGMLOutput
	 xmlns:gml="http://www.opengis.net/gml"
	 xmlns:xlink="http://www.w3.org/1999/xlink"
	 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</msGMLOutput>
`;

// geo.ngu.no/mapserver/BerggrunnWMS3 – lagene Berggrunn_regional_hovedbergarter og
// Berggrunn_nasjonal_hovedbergarter, et punkt i Bergen (utvalgte felt)
export const BERGGRUNN_GML = `<?xml version="1.0" encoding="UTF-8"?>

<msGMLOutput
	 xmlns:gml="http://www.opengis.net/gml"
	 xmlns:xlink="http://www.w3.org/1999/xlink"
	 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<Berggrunn_regional_hovedbergarter_layer>
		<Berggrunn_regional_hovedbergarter_feature>
			<berggrunn_datatype>bergartsflater_regional</berggrunn_datatype>
			<berggrunn_datatype_tekst>Bergartsflater (regionalt nivå, 1:250 000)</berggrunn_datatype_tekst>
			<objekttype>BergartFlate</objekttype>
			<bergartsenhet_tekst>Granittisk gneis, stedvis med mesoperthitt, også amfibolrik gneis og amfibolitt</bergartsenhet_tekst>
			<hovedbergart_tekst>Granittisk gneis</hovedbergart_tekst>
			<tilleggsbergart1_tekst>Amfibolitt</tilleggsbergart1_tekst>
			<tilleggsbergart2_tekst>Amfibolgneis</tilleggsbergart2_tekst>
			<tilleggsbergart3_tekst></tilleggsbergart3_tekst>
			<tektoniskenhet_tekst>Midtre kaledonsk dekkeserie</tektoniskenhet_tekst>
			<dannelsesalder_tekst></dannelsesalder_tekst>
			<dannelsesalder_visning_tekst>Mesoproterozoikum - Ektas 4 (1250-1200 Ma)</dannelsesalder_visning_tekst>
		</Berggrunn_regional_hovedbergarter_feature>
	</Berggrunn_regional_hovedbergarter_layer>
	<Berggrunn_nasjonal_hovedbergarter_zoommax_layer>
		<Berggrunn_nasjonal_hovedbergarter_zoommax_feature>
			<berggrunn_datatype>bergartsflater_nasjonal</berggrunn_datatype>
			<berggrunn_datatype_tekst>Bergartsflater (nasjonalt nivå, 1:1 350 000)</berggrunn_datatype_tekst>
			<objekttype>BergartFlate</objekttype>
			<bergartsenhet_tekst>Omdannet gabbro og monzonitt, ortopyroksenførende  1660–1230 Ma</bergartsenhet_tekst>
			<hovedbergart_tekst>Metagabbro</hovedbergart_tekst>
			<tektoniskenhet_tekst>Midtre kaledonsk dekkeserie</tektoniskenhet_tekst>
		</Berggrunn_nasjonal_hovedbergarter_zoommax_feature>
	</Berggrunn_nasjonal_hovedbergarter_zoommax_layer>
</msGMLOutput>
`;

// nap.ft.dibk.no/services/wms/reguleringsplaner/ – GetFeatureInfo (JSON) med propertyName, Torvet i Trondheim
export const PLAN = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'rpomrade_vn2.fid-7f27454d_1a10347f8f5_41b6',
    geometry: null,
    properties: {
      plannavn: 'Midtbyplanen', plantype: '30', planstatus: '3', ikrafttredelsesdato: '1981-08-28Z',
      'arealplanId.planidentifikasjon': 'r0118', 'arealplanId.kommunenummer': '5001',
      link: 'https://plandialog.isy.no/detailsplan/5001/r0118/True/False',
    },
  }],
  totalFeatures: 'unknown', numberReturned: 1, timeStamp: '2026-10-03T19:47:53.282Z', crs: null,
};
export const PLAN_TOM = { type: 'FeatureCollection', features: [], totalFeatures: 'unknown', numberReturned: 0, crs: null };

// kart.nve.no/enterprise/rest/services/<tjeneste>/MapServer/identify – treff per tjeneste (utvalgte attributter)
export const NVE = {
  // Et punkt i Bergen som ligger i faresone 1/100, 1/1000 og 1/5000
  Skredfaresoner3: { results: [
    { layerId: 0, layerName: 'Kartleggingsomrade', displayFieldName: 'objektType', value: 'Analyseområde',
      attributes: { OBJECTID: '746', analyseomradeNummer: '1243', objektType: 'Analyseområde', kommunenavn: 'Bergen',
        vurdertSkredSannsynlighet: '≥ 1/100, ≥ 1/1000, ≥ 1/5000', rapportnavn: 'Null', rapportdato: '6/6/2025',
        rapportURL: 'https://publikasjoner.nve.no/eksternrapport/2025/eksternrapport2025_18.pdf' } },
    { layerId: 6, layerName: 'Skredfaresone_100', displayFieldName: 'objektType', value: 'Skredfaresone',
      attributes: { OBJECTID: '13170', skredtype: 'Samlet skredfare for alle skredtyper i bratt terreng',
        objektType: 'Skredfaresone', skredSannsynlighet: '≥ 1/100', rapportnummer: 'Null', hensynTilSkog: 'Ja' } },
    { layerId: 7, layerName: 'Skredfaresone_1000', displayFieldName: 'objektType', value: 'Skredfaresone',
      attributes: { OBJECTID: '13055', skredtype: 'Samlet skredfare for alle skredtyper i bratt terreng',
        objektType: 'Skredfaresone', skredSannsynlighet: '≥ 1/1000', rapportnummer: 'Null', hensynTilSkog: 'Ja' } },
    { layerId: 8, layerName: 'Skredfaresone_5000', displayFieldName: 'objektType', value: 'Skredfaresone',
      attributes: { skredtype: 'Samlet skredfare for alle skredtyper i bratt terreng',
        objektType: 'Skredfaresone', skredSannsynlighet: '≥ 1/5000', rapportnummer: 'Null', hensynTilSkog: 'Ja' } },
  ] },
  // Hafella i Trondheim: kvikkleiresone
  SkredKvikkleire2: { results: [
    { layerId: 0, layerName: 'KvikkleireFaregrad', displayFieldName: 'objType', value: 'UtlosningOmr',
      attributes: { OBJECTID: '10', objType: 'UtlosningOmr', skrdOmrNvn: 'Hafella', soneStatus: 'Enkel undersøkelse',
        kommune: 'Trondheim', faregrad: 'Høy', konsekvens: 'Alvorlig', risiko: 'Risikoklasse 3', statusOmr: 'gjeldende' } },
  ] },
  SnoskredAktsomhet: { results: [
    { layerId: 1, layerName: 'S3_snoskred_Aktsomhetsomrade', value: 'PotensieltSkredfareOmr', attributes: {} },
  ] },
  SkredSteinAktR: { results: [
    { layerId: 2, layerName: 'Utlopsomrade', value: 'UtlopOmr', attributes: {} },
  ] },
  JordFlomskredAktsomhet: { results: [] },
  KvikkleireskredAktsomhet: { results: [
    { layerId: 0, layerName: 'KvikkleireskredAktsomhet', value: '11151', attributes: {} },
  ] },
  // Et punkt i Rælingen som ligger i flomsonen for 200- og 1000-årsflom
  Flomsoner2: { results: [
    { layerId: 0, layerName: 'FlomsoneAnalyseomraade', value: 'Analyseområde', attributes: {} },
    { layerId: 17, layerName: 'Flomsone_200arsflom', value: 'FlomAreal',
      attributes: { objektType: 'FlomAreal', flomsoneID: 'fs002_37', gjentaksinterval: '200', statusKartlegging: 'gjeldende', lavpunkt: '0', opphav: 'NVE' } },
    { layerId: 19, layerName: 'Flomsone_1000arsflom', value: 'FlomAreal',
      attributes: { objektType: 'FlomAreal', gjentaksinterval: '1000', statusKartlegging: 'gjeldende', lavpunkt: '0', opphav: 'NVE' } },
    { layerId: 21, layerName: 'Flomsone_200arsflom_klima', value: 'FlomAreal',
      attributes: { objektType: 'FlomAreal', gjentaksinterval: '200', statusKartlegging: 'gjeldende', lavpunkt: '1', opphav: 'NVE' } },
  ] },
  Flomaktsomhet: { results: [
    { layerId: 1, layerName: 'Flom_aktsomhetsomrade', value: 'FlomAktsomhetOmr', attributes: {} },
    { layerId: 2, layerName: 'FlomAktsomhet_Dekning', value: 'FlomAktsomhetDekning', attributes: {} },
  ] },
};

// Svaret fra en ArcGIS-tjeneste som er nede eller ikke finnes (HTTP 200 med error-objekt)
export const NVE_FEIL = { error: { code: 500, message: 'Service wmts/KastWMTS/MapServer not started ', details: [] } };

// api01.nve.no/hydrology/forecast/landslide/v1.0.10/api/Warning/Municipality/4601/1/2026-10-02/2026-10-04 (utvalgte felt)
export const VARSEL = [
  { Id: 'xxx', ActivityLevel: '1', DangerTypeName: null, MainText: 'Grønt nivå', LangKey: 1,
    ValidFrom: '2026-10-02T07:00:00', ValidTo: '2026-10-03T06:59:59',
    MunicipalityList: [{ Id: '4601', Name: 'Bergen', WarningList: null }] },
  { Id: 'xxx', ActivityLevel: '1', DangerTypeName: null, MainText: 'Grønt nivå', LangKey: 1,
    ValidFrom: '2026-10-03T07:00:00', ValidTo: '2026-10-04T06:59:59',
    MunicipalityList: [{ Id: '4601', Name: 'Bergen', WarningList: null }] },
  { Id: '584894', ActivityLevel: '2', DangerTypeName: 'Jord- og flomskredfare', LangKey: 1,
    MainText: 'Varsel om jord- og flomskredfare, gult nivå for Vestland og deler av Rogaland',
    ValidFrom: '2026-10-04T07:00:00', ValidTo: '2026-10-05T06:59:00',
    MunicipalityList: [{ Id: '4601', Name: 'Bergen', WarningList: null }] },
];
// Ukjent kommunenummer gir et «grønt» varsel uten kommune
export const VARSEL_UKJENT_KOMMUNE = [
  { Id: 'xxx', ActivityLevel: '1', MainText: 'Grønt nivå', ValidFrom: '2026-10-03T07:00:00', ValidTo: '2026-10-04T06:59:59', MunicipalityList: [] },
];
