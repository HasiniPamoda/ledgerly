const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const isProd = process.env.NODE_ENV === 'production';
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (isProd) {
    console.error('JWT_SECRET is required in production. See .env.example.');
    process.exit(1);
  }
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('No JWT_SECRET set: using a temporary one (logins reset when the server restarts).');
}

const COOKIE = 'ledgerly_token';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

function setSession(res, userId) {
  const token = jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: WEEK });
}

function requireAuth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies[COOKIE], SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in.' });
  }
}

const router = express.Router();

router.post('/register', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Use a password between 8 and 72 characters.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    setSession(res, Number(info.lastInsertRowid));
    res.status(201).json({ user: { id: Number(info.lastInsertRowid), email } });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'An account with this email already exists.' });
    throw e;
  }
});

router.post('/login', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  setSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  res.json({ user });
});

module.exports = { router, requireAuth };