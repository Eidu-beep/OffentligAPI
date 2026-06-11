import { Router } from 'express';
import {
  opprettNøkkel, listNøkler, settAktiv, slettNøkkel,
  oppdaterGrense, brukHistorikk,
} from '../db.js';
import { cacheStatistikk } from '../utils/cache.js';

const router = Router();

function sjekkAdminNøkkel(req, res, next) {
  const adminNøkkel = process.env.ADMIN_KEY;
  if (!adminNøkkel) return res.status(503).json({ feil: 'ADMIN_KEY ikke konfigurert' });
  if (req.headers['x-admin-key'] !== adminNøkkel) {
    return res.status(403).json({ feil: 'Ugyldig admin-nøkkel' });
  }
  next();
}

router.use(sjekkAdminNøkkel);

// Status / oversikt
router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    tidspunkt: new Date().toISOString(),
    oppetid_sek: Math.round(process.uptime()),
    minne_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    cache: cacheStatistikk(),
  });
});

// List alle nøkler
router.get('/nøkler', (_req, res) => {
  res.json({ dato: new Date().toISOString().split('T')[0], nøkler: listNøkler() });
});

// Opprett ny nøkkel
router.post('/nøkler', (req, res) => {
  const { kundenavn, epost, dagligGrense } = req.body || {};
  if (!kundenavn) return res.status(400).json({ feil: 'kundenavn er påkrevd' });
  const ny = opprettNøkkel({
    kundenavn,
    epost: epost || null,
    dagligGrense: parseInt(dagligGrense || '0'),
  });
  res.status(201).json(ny);
});

// Deaktiver / aktiver
router.patch('/nøkler/:nøkkel/aktiv', (req, res) => {
  const { aktiv } = req.body || {};
  const ok = settAktiv(req.params.nøkkel, !!aktiv);
  if (!ok) return res.status(404).json({ feil: 'Nøkkel ikke funnet' });
  res.json({ ok: true, nøkkel: req.params.nøkkel, aktiv: !!aktiv });
});

// Endre grense
router.patch('/nøkler/:nøkkel/grense', (req, res) => {
  const { dagligGrense } = req.body || {};
  const ok = oppdaterGrense(req.params.nøkkel, parseInt(dagligGrense || '0'));
  if (!ok) return res.status(404).json({ feil: 'Nøkkel ikke funnet' });
  res.json({ ok: true, nøkkel: req.params.nøkkel, dagligGrense: parseInt(dagligGrense || '0') });
});

// Slett
router.delete('/nøkler/:nøkkel', (req, res) => {
  const ok = slettNøkkel(req.params.nøkkel);
  if (!ok) return res.status(404).json({ feil: 'Nøkkel ikke funnet' });
  res.json({ ok: true, slettet: req.params.nøkkel });
});

// Bruk-historikk for én nøkkel
router.get('/nøkler/:nøkkel/historikk', (req, res) => {
  res.json({ nøkkel: req.params.nøkkel, historikk: brukHistorikk(req.params.nøkkel, 30) });
});

export default router;
