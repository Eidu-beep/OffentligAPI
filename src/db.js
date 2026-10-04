import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

// Databasefil. Den må ligge på et persistent volum, ellers slettes alle API-nøkler ved hver deploy.
// Railway setter RAILWAY_VOLUME_MOUNT_PATH når et volum er koblet til tjenesten. Da legges
// databasen der automatisk. DB_PATH kan fortsatt settes for å overstyre plasseringen.
const VOLUM = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
const DB_PATH = process.env.DB_PATH || (VOLUM ? join(VOLUM, 'eiendom.db') : './data/eiendom.db');

const mappe = dirname(DB_PATH);
if (!existsSync(mappe)) mkdirSync(mappe, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Sier fra i loggen om nøklene er trygge. Vises i Railway under Deployments → View logs.
const dbSti = resolve(DB_PATH);
export const paVolum = !!VOLUM && dbSti.startsWith(resolve(VOLUM) + sep);
console.log(`Database: ${dbSti}${paVolum ? ` (persistent volum på ${VOLUM})` : ''}`);
if (process.env.NODE_ENV === 'production' && !paVolum) {
  console.warn('ADVARSEL: Databasen ligger ikke på et persistent volum. Alle API-nøkler slettes ved neste deploy.');
}

// Opprett tabeller hvis de ikke finnes
db.exec(`
  CREATE TABLE IF NOT EXISTS nøkler (
    nøkkel        TEXT PRIMARY KEY,
    kundenavn     TEXT NOT NULL,
    epost         TEXT,
    daglig_grense INTEGER NOT NULL DEFAULT 0,
    aktiv         INTEGER NOT NULL DEFAULT 1,
    opprettet     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bruk (
    nøkkel  TEXT NOT NULL,
    dato    TEXT NOT NULL,
    antall  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (nøkkel, dato)
  );
`);

function dagensDato() {
  return new Date().toISOString().split('T')[0];
}

// ── Nøkkeladministrasjon ──────────────────────────────────────────────

export function opprettNøkkel({ kundenavn, epost = null, dagligGrense = 0 }) {
  const nøkkel = 'ek_' + randomBytes(24).toString('hex');
  db.prepare(`
    INSERT INTO nøkler (nøkkel, kundenavn, epost, daglig_grense, aktiv, opprettet)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(nøkkel, kundenavn, epost, dagligGrense, new Date().toISOString());
  return hentNøkkel(nøkkel);
}

export function hentNøkkel(nøkkel) {
  return db.prepare('SELECT * FROM nøkler WHERE nøkkel = ?').get(nøkkel);
}

export function listNøkler() {
  const dato = dagensDato();
  const rader = db.prepare('SELECT * FROM nøkler ORDER BY opprettet DESC').all();
  return rader.map(r => {
    const b = db.prepare('SELECT antall FROM bruk WHERE nøkkel = ? AND dato = ?').get(r.nøkkel, dato);
    return {
      nøkkel: r.nøkkel,
      kundenavn: r.kundenavn,
      epost: r.epost,
      dagligGrense: r.daglig_grense || 'ubegrenset',
      aktiv: !!r.aktiv,
      opprettet: r.opprettet,
      bruktI_dag: b?.antall || 0,
    };
  });
}

export function settAktiv(nøkkel, aktiv) {
  const res = db.prepare('UPDATE nøkler SET aktiv = ? WHERE nøkkel = ?').run(aktiv ? 1 : 0, nøkkel);
  return res.changes > 0;
}

export function slettNøkkel(nøkkel) {
  const res = db.prepare('DELETE FROM nøkler WHERE nøkkel = ?').run(nøkkel);
  db.prepare('DELETE FROM bruk WHERE nøkkel = ?').run(nøkkel);
  return res.changes > 0;
}

export function oppdaterGrense(nøkkel, dagligGrense) {
  const res = db.prepare('UPDATE nøkler SET daglig_grense = ? WHERE nøkkel = ?').run(dagligGrense, nøkkel);
  return res.changes > 0;
}

// ── Bruk ──────────────────────────────────────────────────────────────

export function registrerBruk(nøkkel) {
  const dato = dagensDato();
  db.prepare(`
    INSERT INTO bruk (nøkkel, dato, antall) VALUES (?, ?, 1)
    ON CONFLICT(nøkkel, dato) DO UPDATE SET antall = antall + 1
  `).run(nøkkel, dato);
  const r = db.prepare('SELECT antall FROM bruk WHERE nøkkel = ? AND dato = ?').get(nøkkel, dato);
  return r.antall;
}

export function hentBrukI_dag(nøkkel) {
  const dato = dagensDato();
  const r = db.prepare('SELECT antall FROM bruk WHERE nøkkel = ? AND dato = ?').get(nøkkel, dato);
  return r?.antall || 0;
}

export function brukHistorikk(nøkkel, dager = 30) {
  return db.prepare(`
    SELECT dato, antall FROM bruk
    WHERE nøkkel = ?
    ORDER BY dato DESC
    LIMIT ?
  `).all(nøkkel, dager);
}

// ── Migrering fra env (engangskjøring ved oppstart) ───────────────────

export function migrerFraEnv() {
  const rå = process.env.API_KEYS || '';
  if (!rå) return;
  const finnes = db.prepare('SELECT COUNT(*) AS n FROM nøkler').get();
  if (finnes.n > 0) return; // allerede migrert / har data

  const sett = db.prepare(`
    INSERT OR IGNORE INTO nøkler (nøkkel, kundenavn, epost, daglig_grense, aktiv, opprettet)
    VALUES (?, ?, NULL, ?, 1, ?)
  `);
  let antall = 0;
  for (const del of rå.split(',')) {
    const [nøkkel, navn, grense] = del.trim().split(':');
    if (nøkkel && navn) {
      sett.run(nøkkel.trim(), navn.trim(), parseInt(grense || '0'), new Date().toISOString());
      antall++;
    }
  }
  if (antall) console.log(`Migrerte ${antall} nøkkel(er) fra API_KEYS til database`);
}

export default db;
