import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import eiendomRuter from './src/routes/eiendom.js';
import adminRuter from './src/routes/admin.js';
import { perIpLimiter, globalLimiter } from './src/middleware/rateLimiter.js';
import { sjekkApiNøkkel } from './src/middleware/apiNokkel.js';
import db, { migrerFraEnv } from './src/db.js';

migrerFraEnv();

const app = express();
const PORT = process.env.PORT || 3000;

// Railway kjører appen bak én proxy. Uten dette ser alle forespørsler ut til å komme fra
// samme IP, og grensen per IP ville i praksis gjelde alle brukere samlet.
app.set('trust proxy', 1);

const tillatteDomener = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  // Ikke-tillatte domener får svar uten CORS-headere, så nettleseren blokkerer dem.
  // (Å kaste en feil her ga 500 og en forvirrende feilmelding.)
  origin: (origin, callback) => {
    callback(null, !origin || tillatteDomener.length === 0 || tillatteDomener.includes(origin));
  },
}));
app.use(express.json());
app.use(globalLimiter);

// Åpne endepunkter (ingen nøkkel)
app.get('/helse', (_req, res) => {
  res.json({ ok: true, tidspunkt: new Date().toISOString(), versjon: '1.0.0' });
});

// Admin (beskyttet med ADMIN_KEY)
app.use('/admin', adminRuter);

// Eiendom (krever API-nøkkel)
app.use('/eiendom', perIpLimiter, sjekkApiNøkkel, eiendomRuter);

app.use((_req, res) => {
  res.status(404).json({
    feil: 'Endepunkt ikke funnet',
    tilgjengelige: ['/eiendom?adresse=...', '/helse', '/admin/status'],
  });
});

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ feil: 'Intern serverfeil' });
});

const server = app.listen(PORT, () => {
  console.log(`Eiendomsdata API kjører på port ${PORT}`);
  console.log(`Tillatte domener: ${tillatteDomener.join(', ') || 'alle (development)'}`);
});

// Railway stopper containeren med SIGTERM når en ny deploy tar over, og når tjenesten legges i dvale.
// Node kjører som hovedprosess i containeren, og en hovedprosess uten egen håndtering overser SIGTERM.
// Da blir den tvangsavsluttet, og Railway melder deployen som krasjet. Derfor avslutter vi selv, med kode 0.
let avslutter = false;
function avslutt(signal) {
  if (avslutter) return;
  avslutter = true;
  console.log(`${signal} mottatt, avslutter`);
  const ferdig = () => {
    try { db.close(); } catch { /* databasen er allerede lukket */ }
    process.exit(0);
  };
  server.close(ferdig);
  // Et oppslag som fortsatt pågår, kan holde serveren åpen. Vent ikke lenger enn to sekunder.
  setTimeout(ferdig, 2000).unref();
}
process.on('SIGTERM', () => avslutt('SIGTERM'));
process.on('SIGINT', () => avslutt('SIGINT'));

// Eksporteres slik at testene (npm test) kan stoppe serveren når de er ferdige
export { app, server };
