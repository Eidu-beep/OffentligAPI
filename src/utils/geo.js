export function wgs84TilUtm33(lat, lon) {
  const a = 6378137, f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = 1 - (b * b) / (a * a);
  const k0 = 0.9996;
  const lon0 = 15 * Math.PI / 180;
  const φ = lat * Math.PI / 180;
  const λ = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2;
  const C = (e2 / (1 - e2)) * Math.cos(φ) ** 2;
  const A = (λ - lon0) * Math.cos(φ);
  const M = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64) * φ
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32) * Math.sin(2 * φ)
    + (15 * e2 ** 2 / 256) * Math.sin(4 * φ)
  );
  const easting  = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2) * A ** 5 / 120) + 500000;
  const northing = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2) * A ** 6 / 720));
  return { utmNord: Math.round(northing), utmOst: Math.round(easting) };
}

export function rundetKoordinat(v, desimaler = 4) {
  return Math.round(v * 10 ** desimaler) / 10 ** desimaler;
}

export function koordinatNokkel(lat, lon) {
  return `${rundetKoordinat(lat)}:${rundetKoordinat(lon)}`;
}

// Offisiell UTM-sone (EUREF89) for en kommune, som EPSG-kode.
// Sone 33 for Nordland (18) og Troms (55), sone 35 for Finnmark (56), sone 32 for resten.
// Arealer beregnes i den offisielle sonen, slik at tallene stemmer med matrikkelen.
export function utmEpsgForKommune(kommunenummer) {
  const fylke = String(kommunenummer ?? '').padStart(4, '0').slice(0, 2);
  if (fylke === '18' || fylke === '55') return 25833;
  if (fylke === '56') return 25835;
  return 25832;
}

function ringAreal(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum) / 2;
}

// Areal i m² for en GeoJSON Polygon eller MultiPolygon i plane koordinater (meter).
// Første ring i hver polygon er yttergrensen, resten er hull som trekkes fra.
export function polygonAreal(geometri) {
  if (!geometri?.coordinates) return 0;
  const polygoner =
    geometri.type === 'MultiPolygon' ? geometri.coordinates :
    geometri.type === 'Polygon' ? [geometri.coordinates] : [];
  let areal = 0;
  for (const ringer of polygoner) {
    ringer.forEach((ring, i) => { areal += (i === 0 ? 1 : -1) * ringAreal(ring); });
  }
  return Math.max(0, areal);
}
