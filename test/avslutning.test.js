// Tester at serveren avslutter ryddig når den får SIGTERM. Det er signalet Railway sender når en
// ny deploy tar over, og når tjenesten legges i dvale. Kjør med: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rot = join(dirname(fileURLToPath(import.meta.url)), '..');
const vent = ms => new Promise(ferdig => setTimeout(ferdig, ms));

function ledigPort() {
  return new Promise((ferdig, feil) => {
    const s = createServer();
    s.once('error', feil);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ferdig(port)); });
  });
}

// Starter serveren som en egen prosess, slik Railway gjør (node server.js), og venter til den lytter
async function startServer() {
  const port = await ledigPort();
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    ADMIN_KEY: 'lokal-admin',
    API_KEYS: '',
    ALLOWED_ORIGINS: '',
    DB_PATH: join(mkdtempSync(join(tmpdir(), 'eiendom-avslutning-')), 'test.db'),
  };
  delete env.RAILWAY_VOLUME_MOUNT_PATH;
  const barn = spawn(process.execPath, ['server.js'], { cwd: rot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logg = { tekst: '' };
  barn.stdout.on('data', d => { logg.tekst += d; });
  barn.stderr.on('data', d => { logg.tekst += d; });
  const avsluttet = new Promise(ferdig => barn.on('exit', (kode, signal) => ferdig({ kode, signal })));

  const frist = Date.now() + 10000;
  while (!logg.tekst.includes('kjører på port')) {
    if (Date.now() > frist) { barn.kill('SIGKILL'); assert.fail('Serveren startet ikke: ' + logg.tekst); }
    await vent(50);
  }
  return { barn, logg, avsluttet, base: `http://127.0.0.1:${port}` };
}

// Windows har ikke SIGTERM. Der stopper kill() prosessen uten at koden får kjøre.
const hoppOver = process.platform === 'win32';

test('SIGTERM gir ryddig avslutning med kode 0', { skip: hoppOver }, async () => {
  const { barn, logg, avsluttet } = await startServer();
  const start = Date.now();
  barn.kill('SIGTERM');
  const { kode, signal } = await avsluttet;

  assert.equal(signal, null, 'prosessen skal avslutte selv, ikke bli stoppet av signalet');
  assert.equal(kode, 0);
  assert.match(logg.tekst, /SIGTERM mottatt, avslutter/);
  assert.ok(Date.now() - start < 3000, 'avslutningen skal ta under tre sekunder');
});

test('SIGTERM avslutter også når en nettleser holder en forbindelse åpen', { skip: hoppOver }, async () => {
  const { barn, avsluttet, base } = await startServer();
  // fetch gjenbruker forbindelsen (keep-alive), slik en nettleser gjør
  const r = await fetch(`${base}/helse`);
  assert.equal((await r.json()).ok, true);

  const start = Date.now();
  barn.kill('SIGTERM');
  const { kode } = await avsluttet;

  assert.equal(kode, 0);
  assert.ok(Date.now() - start < 3000, 'avslutningen skal ta under tre sekunder');
});
