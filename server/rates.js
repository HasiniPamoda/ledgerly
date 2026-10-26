// Exchange rates, expressed as units of each currency per 1 US dollar.
// Live rates come from a free public API and are cached; if that fails we fall back to rough built-in values.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'LKR', 'INR', 'JPY'];

// Approximate offline values, used only when live rates cannot be fetched. Update them occasionally.
const FALLBACK = { USD: 1, EUR: 0.86, GBP: 0.75, LKR: 336, INR: 88, JPY: 150 };

const DEFAULT_URL = 'https://open.er-api.com/v6/latest/USD';
const TTL = 6 * 60 * 60 * 1000;   // keep live rates for 6 hours
const RETRY = 10 * 60 * 1000;     // after a failure, try again in 10 minutes

let cache = null;
let pending = null;

// Set RATES_URL to an empty value to disable live fetching (used in tests).
const ratesUrl = () => (process.env.RATES_URL === undefined ? DEFAULT_URL : process.env.RATES_URL);

async function refresh() {
  let result = { rates: FALLBACK, source: 'fallback', updated: null };
  let ttl = RETRY;
  const url = ratesUrl();
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      if (data.result === 'success' && CURRENCIES.every((c) => Number(data.rates && data.rates[c]) > 0)) {
        const rates = Object.fromEntries(CURRENCIES.map((c) => [c, Number(data.rates[c])]));
        result = { rates, source: 'live', updated: data.time_last_update_utc || null };
        ttl = TTL;
      }
    } catch {
      // keep the fallback values
    }
  }
  cache = { ...result, expires: Date.now() + ttl };
  return cache;
}

async function getRates() {
  if (cache && cache.expires > Date.now()) return cache;
  pending = pending || refresh().finally(() => { pending = null; });
  return pending;
}

const resetCache = () => { cache = null; pending = null; };

module.exports = { getRates, resetCache, CURRENCIES, FALLBACK };
