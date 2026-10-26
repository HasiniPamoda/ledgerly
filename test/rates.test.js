const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const rates = require('../server/rates.js');

let server;
let mode = 'ok';
let hits = 0;

before(() => new Promise((resolve) => {
  server = http.createServer((req, res) => {
    hits += 1;
    if (mode === 'error') { res.writeHead(500); return res.end('nope'); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      result: 'success',
      time_last_update_utc: 'Mon, 26 Oct 2026 00:02:31 +0000',
      rates: { USD: 1, EUR: 0.9, GBP: 0.8, LKR: 300, INR: 85, JPY: 140, CAD: 1.3 },
    }));
  }).listen(0, () => {
    process.env.RATES_URL = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
after(() => new Promise((resolve) => server.close(resolve)));

test('uses live rates, keeps only supported currencies, and caches them', async () => {
  rates.resetCache();
  const first = await rates.getRates();
  assert.equal(first.source, 'live');
  assert.equal(first.rates.LKR, 300);
  assert.equal(first.rates.CAD, undefined);
  assert.match(first.updated, /26 Oct 2026/);
  await rates.getRates();
  assert.equal(hits, 1);
});

test('falls back to built-in rates when the live source fails', async () => {
  rates.resetCache();
  mode = 'error';
  const r = await rates.getRates();
  assert.equal(r.source, 'fallback');
  assert.deepEqual(r.rates, rates.FALLBACK);
});
