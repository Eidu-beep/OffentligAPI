import { Router } from 'express';
import { slaaOppAdresse } from '../services/adresse.js';
import { hentTeig } from '../services/teig.js';
import { hentPlan } from '../services/plan.js';
import { hentLosmasse, hentBerggrunn } from '../services/ngu.js';
import { hentSkredfare, hentFlomsone, hentJordskredvarsel } from '../services/nve.js';

const router = Router();

router.get('/', async (req, res) => {
  const adresse = req.query.adresse?.trim();
  if (!adresse) {
    return res.status(400).json({ feil: 'Mangler adresse-parameter. Bruk ?adresse=Storgata+1,+Oslo' });
  }

  const start = Date.now();

  let stedsdata;
  try {
    stedsdata = await slaaOppAdresse(adresse);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ feil: 'Ingen adressetreff', sok: err.sok });
    }
    return res.status(502).json({ feil: 'Adresseoppslag feilet', detaljer: err.message });
  }

  const { lat, lon, kommunenummer } = stedsdata;

  const [teig, plan, losmasse, berggrunn, skred, flom, jordskred] = await Promise.allSettled([
    hentTeig(lat, lon),
    hentPlan(lat, lon),
    hentLosmasse(lat, lon),
    hentBerggrunn(lat, lon),
    hentSkredfare(lat, lon),
    hentFlomsone(lat, lon),
    hentJordskredvarsel(kommunenummer),
  ]).then(r => r.map(p => p.status === 'fulfilled' ? p.value : { funnet: false, feil: true }));

  const hentetMs = Date.now() - start;

  return res.json({
    meta: {
      adresse:         stedsdata.adresse,
      poststed:        stedsdata.poststed,
      postnummer:      stedsdata.postnummer,
      kommunenavn:     stedsdata.kommunenavn,
      kommunenummer:   stedsdata.kommunenummer,
      cachet:          stedsdata.cachet,
      hentetMs,
    },
    koordinater: {
      lat:     stedsdata.lat,
      lon:     stedsdata.lon,
      utmNord: stedsdata.utmNord,
      utmOst:  stedsdata.utmOst,
    },
    matrikkel: {
      gardsnummer:   stedsdata.gardsnummer,
      bruksnummer:   stedsdata.bruksnummer,
      seksjonsnummer: stedsdata.seksjonsnummer,
      festenummer:   stedsdata.festenummer,
    },
    teig,
    reguleringsplan: plan,
    losmasser:       losmasse,
    berggrunn,
    skredfare:       skred,
    flomsone:        flom,
    jordskredvarsel: jordskred,
  });
});

export default router;
