require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { router: authRouter, requireAuth } = require('./auth');
const apiRouter = require('./routes');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // set when deployed behind a proxy (Render, Railway, nginx)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// CSRF guard: browsers cannot send this custom header cross-site without a CORS preflight, which we never allow.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'ledgerly') return res.status(403).json({ error: 'Forbidden.' });
  next();
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Ledgerly running at http://localhost:${port}`));
}

module.exports = app;