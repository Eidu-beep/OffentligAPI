import rateLimit from 'express-rate-limit';

export const perIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { feil: 'For mange forespørsler, prøv igjen om litt.' },
});

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { feil: 'Tjenesten er overbelastet, prøv igjen om litt.' },
});
