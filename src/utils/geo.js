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
