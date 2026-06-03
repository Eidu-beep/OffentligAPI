import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import eiendomRuter from './src/routes/eiendom.js';
import { perIpLimiter, globalLimiter } from './src/middleware/rateLimiter.js';
import { cacheStatistikk } from './src/utils/cache.js';

const app = express();
const PORT = process.env.PORT || 3000;

const tillatteDomener = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || tillatteDomener.length === 0 || tillatteDomener.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: ${origin} er ikke tillatt`));
    }
  },
}));
app.use(express.json());
app.use(globalLimiter);

app.get('/helse', (_req, res) => {
  res.json({ ok: true, tidspunkt: new Date().toISOString(), versjon: '1.0.0' });
});

app.get('/cache/statistikk', (_req, res) => {
  res.json(cacheStatistikk());
});

app.use('/eiendom', perIpLimiter, eiendomRuter);

app.use((_req, res) => {
  res.status(404).json({ feil: 'Endepunkt ikke funnet', tilgjengelige: ['/eiendom', '/helse', '/cache/statistikk'] });
});

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ feil: 'Intern serverfeil' });
});

app.listen(PORT, () => {
  console.log(`Eiendomsdata API kjører på port ${PORT}`);
  console.log(`Tillatte domener: ${tillatteDomener.join(', ') || 'alle (development)'}`);
});
