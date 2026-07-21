import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'change-me';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const portfolios = new Map();

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function buildSummary(list) {
  const totalInitialBalance = list.reduce((sum, x) => sum + round2(x.initialBalance), 0);
  const totalProfit = list.reduce((sum, x) => sum + round2(x.profit), 0);
  const totalEquity = list.reduce((sum, x) => sum + round2(x.equity), 0);
  const usdThb = list[0]?.usdThb ?? 36.5;
  const minInitialBalance = list.length ? Math.min(...list.map(x => round2(x.initialBalance))) : 0;
  const maxInitialBalance = list.length ? Math.max(...list.map(x => round2(x.initialBalance))) : 0;

  return {
    totalAccounts: list.length,
    totalInitialBalance: round2(totalInitialBalance),
    totalProfit: round2(totalProfit),
    totalProfitTHB: round2(totalProfit * usdThb),
    totalEquity: round2(totalEquity),
    totalGainPct: totalInitialBalance ? round2((totalProfit / totalInitialBalance) * 100) : 0,
    usdThb: round2(usdThb),
    minInitialBalance: round2(minInitialBalance),
    maxInitialBalance: round2(maxInitialBalance),
    lastRefresh: new Date().toISOString()
  };
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'mt5-backend-render',
    endpoints: ['/health', '/api/dashboard', '/api/mt5/update'],
    portfolios: portfolios.size
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), portfolios: portfolios.size, now: new Date().toISOString() });
});

app.post('/api/mt5/update', (req, res) => {
  const incomingKey = req.header('x-api-key');
  if (incomingKey !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const item = req.body || {};
  if (!item.login || !item.portfolioName || item.initialBalance == null || item.equity == null) {
    return res.status(400).json({ ok: false, error: 'invalid payload' });
  }

  const profit = round2(item.profit ?? (Number(item.equity) - Number(item.initialBalance)));
  const initialBalance = round2(item.initialBalance);
  const gainPct = round2(item.gainPct ?? (initialBalance ? (profit / initialBalance) * 100 : 0));

  const normalized = {
    name: String(item.portfolioName),
    login: Number(item.login),
    server: String(item.server || ''),
    online: item.online !== false,
    initialBalance,
    equity: round2(item.equity),
    profit,
    gainPct,
    pingMs: Number(item.pingMs || 0),
    updatedAt: item.updatedAt || new Date().toISOString(),
    usdThb: round2(item.usdThb || 36.5)
  };

  portfolios.set(String(normalized.login), normalized);
  res.json({ ok: true, saved: normalized, totalPortfolios: portfolios.size });
});

app.get('/api/dashboard', (_req, res) => {
  const list = Array.from(portfolios.values()).sort((a, b) => a.login - b.login);
  res.json({ summary: buildSummary(list), portfolios: list });
});

app.listen(PORT, () => {
  console.log(`MT5 backend listening on port ${PORT}`);
});
