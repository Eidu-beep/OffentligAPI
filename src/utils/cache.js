import NodeCache from 'node-cache';

const TTL = {
  adresse:       60 * 60 * 24 * 7,   // 7 dager
  teig:          60 * 60 * 24 * 7,   // 7 dager
  plan:          60 * 60 * 24,        // 24 timer
  losmasse:      60 * 60 * 24 * 30,  // 30 dager
  berggrunn:     60 * 60 * 24 * 30,  // 30 dager
  skred:         60 * 60 * 24,        // 24 timer
  flom:          60 * 60 * 24,        // 24 timer
  jordskred:     60 * 60,             // 1 time
};

const maxKeys = parseInt(process.env.CACHE_MAX_KEYS || '10000');
const cache = new NodeCache({ maxKeys, useClones: false });

let treff = 0;
let miss = 0;

export function hentCache(type, nokkel) {
  const val = cache.get(`${type}:${nokkel}`);
  if (val !== undefined) { treff++; return val; }
  miss++;
  return null;
}

export function settCache(type, nokkel, verdi) {
  cache.set(`${type}:${nokkel}`, verdi, TTL[type] ?? 3600);
}

export function cacheStatistikk() {
  const total = treff + miss;
  return {
    nokler: cache.keys().length,
    treff,
    miss,
    treffRate: total > 0 ? Math.round((treff / total) * 100) + '%' : 'n/a',
    maxNokler: maxKeys,
  };
}
