const express = require('express');
const db = require('./db');

const EXPENSE_CATS = ['Food', 'Housing', 'Transport', 'Shopping', 'Bills', 'Health', 'Fun', 'Other'];
const INCOME_CATS = ['Salary', 'Freelance', 'Other income'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'LKR', 'INR', 'JPY'];

const router = express.Router();

const toDto = (r) => ({ id: r.id, date: r.date, type: r.type, category: r.category, amount: r.amount_cents / 100, note: r.note });
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

router.get('/transactions', (req, res) => {
  const rows = db.prepare(
    'SELECT id, date, type, category, amount_cents, note FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC'
  ).all(req.userId);
  res.json(rows.map(toDto));
});

router.post('/transactions', (req, res) => {
  const { date, type, category } = req.body;
  const amount = Number(req.body.amount);
  const note = String(req.body.note || '').trim().slice(0, 60);
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;

  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Type must be income or expense.' });
  if (!validDate(String(date))) return res.status(400).json({ error: 'Enter a valid date.' });
  if (!cats.includes(category)) return res.status(400).json({ error: 'Choose a valid category.' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return res.status(400).json({ error: 'Enter an amount greater than zero.' });

  const info = db.prepare(
    'INSERT INTO transactions (user_id, date, type, category, amount_cents, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, date, type, category, Math.round(amount * 100), note);
  const row = db.prepare('SELECT id, date, type, category, amount_cents, note FROM transactions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(toDto(row));
});

router.delete('/transactions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Transaction not found.' });
  res.status(204).end();
});

router.get('/settings', (req, res) => {
  const row = db.prepare('SELECT budget, currency FROM settings WHERE user_id = ?').get(req.userId);
  res.json(row || { budget: 1500, currency: 'USD' });
});

router.put('/settings', (req, res) => {
  const budget = Number(req.body.budget);
  const currency = req.body.currency;
  if (!Number.isFinite(budget) || budget <= 0 || budget > 1e9) return res.status(400).json({ error: 'Enter a budget greater than zero.' });
  if (!CURRENCIES.includes(currency)) return res.status(400).json({ error: 'Unsupported currency.' });
  db.prepare(
    `INSERT INTO settings (user_id, budget, currency) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET budget = excluded.budget, currency = excluded.currency`
  ).run(req.userId, budget, currency);
  res.json({ budget, currency });
});

module.exports = router;