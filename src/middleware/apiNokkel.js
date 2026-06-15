import { hentNøkkel, registrerBruk, hentBrukI_dag } from '../db.js';

export function sjekkApiNøkkel(req, res, next) {
  if (req.path === '/helse') return next();

  const nøkkel = req.headers['x-api-key'] || req.query.api_key;

  if (!nøkkel) {
    return res.status(401).json({
      feil: 'Mangler API-nøkkel',
      hjelp: 'Send nøkkelen i headeren X-Api-Key eller som ?api_key=... i URL-en',
    });
  }

  const info = hentNøkkel(nøkkel);
  if (!info) {
    return res.status(403).json({ feil: 'Ugyldig API-nøkkel' });
  }
  if (!info.aktiv) {
    return res.status(403).json({ feil: 'API-nøkkelen er deaktivert' });
  }

  // Sjekk daglig grense
  if (info.daglig_grense > 0) {
    const bruk = hentBrukI_dag(nøkkel);
    if (bruk >= info.daglig_grense) {
      return res.status(429).json({
        feil: 'Daglig grense nådd',
        grense: info.daglig_grense,
        brukt: bruk,
        nullstilles: 'midnatt UTC',
      });
    }
  }

  const antall = registrerBruk(nøkkel);
  req.apiKunde = {
    navn: info.kundenavn,
    nøkkel,
    dagligBruk: antall,
    dagligGrens: info.daglig_grense,
  };

  next();
}
