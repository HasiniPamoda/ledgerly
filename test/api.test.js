const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerly-'));
process.env.JWT_SECRET = 'test-secret';
process.env.AUTH_RATE_LIMIT = '1000';
const app = require('../server/index.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => new Promise((r) => server.close(r)));

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, {
    method,
    headers: { 'X-Requested-With': 'ledgerly', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: set ? set.split(';')[0] : cookie };
}

test('serves the frontend', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Ledgerly/);
});

test('rejects unauthenticated API calls and missing CSRF header', async () => {
  assert.equal((await call('GET', '/api/transactions')).status, 401);
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('register validation, duplicates and login', async () => {
  assert.equal((await call('POST', '/api/auth/register', { email: 'bad', password: 'longenough1' })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { email: 'a@x.com', password: 'short' })).status, 400);
  const ok = await call('POST', '/api/auth/register', { email: 'A@x.com', password: 'longenough1' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.email, 'a@x.com');
  assert.equal((await call('POST', '/api/auth/register', { email: 'a@x.com', password: 'longenough1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { email: 'a@x.com', password: 'wrongpass1' })).status, 401);
  const login = await call('POST', '/api/auth/login', { email: 'a@x.com', password: 'longenough1' });
  assert.equal(login.status, 200);
  assert.equal((await call('GET', '/api/auth/me', null, login.cookie)).data.user.email, 'a@x.com');
});

test('transactions CRUD and per-user isolation', async () => {
  const a = await call('POST', '/api/auth/register', { email: 'u1@x.com', password: 'longenough1' });
  const b = await call('POST', '/api/auth/register', { email: 'u2@x.com', password: 'longenough1' });

  assert.equal((await call('POST', '/api/transactions', { date: '2026-10-01', type: 'expense', category: 'Salary', amount: 5 }, a.cookie)).status, 400);
  assert.equal((await call('POST', '/api/transactions', { date: '2026-10-01', type: 'expense', category: 'Food', amount: -5 }, a.cookie)).status, 400);

  const tx = await call('POST', '/api/transactions', { date: '2026-10-01', type: 'expense', category: 'Food', amount: 12.34, note: 'Lunch' }, a.cookie);
  assert.equal(tx.status, 201);
  assert.equal(tx.data.amount, 12.34);

  assert.equal((await call('GET', '/api/transactions', null, a.cookie)).data.length, 1);
  assert.equal((await call('GET', '/api/transactions', null, b.cookie)).data.length, 0);
  assert.equal((await call('DELETE', `/api/transactions/${tx.data.id}`, null, b.cookie)).status, 404);
  assert.equal((await call('DELETE', `/api/transactions/${tx.data.id}`, null, a.cookie)).status, 204);
  assert.equal((await call('GET', '/api/transactions', null, a.cookie)).data.length, 0);
});

test('settings default, update and validation', async () => {
  const u = await call('POST', '/api/auth/register', { email: 's@x.com', password: 'longenough1' });
  assert.deepEqual((await call('GET', '/api/settings', null, u.cookie)).data, { budget: 1500, currency: 'USD' });
  assert.equal((await call('PUT', '/api/settings', { budget: 900, currency: 'EUR' }, u.cookie)).status, 200);
  assert.deepEqual((await call('GET', '/api/settings', null, u.cookie)).data, { budget: 900, currency: 'EUR' });
  assert.equal((await call('PUT', '/api/settings', { budget: 0, currency: 'EUR' }, u.cookie)).status, 400);
  assert.equal((await call('PUT', '/api/settings', { budget: 5, currency: 'XXX' }, u.cookie)).status, 400);
});

test('logout clears the session cookie', async () => {
  const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'ledgerly' } });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('set-cookie'), /ledgerly_token=;/);
});