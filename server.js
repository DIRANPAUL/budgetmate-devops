'use strict';

/**
 * server.js
 * -----------------------------------------------------------------------
 * BudgetMate API — a small, dependency-free Node.js HTTP service exposing
 * the budgeting/categorisation/goal-projection logic in lib/budgetLogic.js.
 *
 * Deliberately built on Node's built-in `http` module rather than a
 * framework such as Express: it keeps the runtime dependency count at
 * zero, which (a) removes an entire class of supply-chain/npm-audit
 * findings before the Security stage even runs, and (b) lets the whole
 * service start with nothing more than `node server.js` — no install step
 * required on any machine that just has Node 18+.
 *
 * Routes:
 *   GET  /health                          liveness/readiness probe (Monitoring stage)
 *   GET  /metrics                         plain-text Prometheus-style metrics (Monitoring stage)
 *   GET  /api/transactions                list all transactions, newest first
 *   POST /api/transactions                add a transaction (auto-categorised)
 *   GET  /api/budgets/:category/status    spend vs limit for a category
 *   POST /api/categorize                  categorise an arbitrary description
 *   GET  /api/goals/:id/projection        weeks-to-goal projection
 * -----------------------------------------------------------------------
 */

const http = require('node:http');
const { URL } = require('node:url');
const {
  categorizeTransaction,
  calculateBudgetStatus,
  projectSavingsGoal,
} = require('./lib/budgetLogic');
const store = require('./lib/store');

const PORT = Number(process.env.PORT) || 3000;
const START_TIME = Date.now();
let requestCount = 0;
let errorCount = 0;

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function requestListener(req, res) {
  requestCount += 1;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const segments = url.pathname.split('/').filter(Boolean);

  try {
    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        timestamp: new Date().toISOString(),
      });
    }

    // GET /metrics — minimal Prometheus exposition format, scraped in the Monitoring stage
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const uptime = Math.floor((Date.now() - START_TIME) / 1000);
      const body = [
        '# HELP budgetmate_uptime_seconds Time since process start',
        '# TYPE budgetmate_uptime_seconds counter',
        `budgetmate_uptime_seconds ${uptime}`,
        '# HELP budgetmate_requests_total Total HTTP requests served',
        '# TYPE budgetmate_requests_total counter',
        `budgetmate_requests_total ${requestCount}`,
        '# HELP budgetmate_errors_total Total HTTP 5xx responses served',
        '# TYPE budgetmate_errors_total counter',
        `budgetmate_errors_total ${errorCount}`,
        '',
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      return res.end(body);
    }

    // GET /api/transactions
    if (req.method === 'GET' && url.pathname === '/api/transactions') {
      return sendJson(res, 200, { transactions: store.listTransactions() });
    }

    // POST /api/transactions
    if (req.method === 'POST' && url.pathname === '/api/transactions') {
      const body = await readJsonBody(req);
      if (typeof body.description !== 'string' || typeof body.amount !== 'number') {
        return sendJson(res, 400, { error: 'description (string) and amount (number) are required' });
      }
      const record = store.addTransaction({
        description: body.description,
        amount: body.amount,
        date: body.date || new Date().toISOString().slice(0, 10),
      });
      return sendJson(res, 201, { transaction: record });
    }

    // GET /api/budgets/:category/status
    if (req.method === 'GET' && segments[0] === 'api' && segments[1] === 'budgets' && segments[3] === 'status') {
      const category = decodeURIComponent(segments[2]);
      const limit = store.getBudgetLimit(category);
      if (limit === undefined) {
        return sendJson(res, 404, { error: `No budget configured for category "${category}"` });
      }
      const status = calculateBudgetStatus(store.listTransactions(), category, limit);
      return sendJson(res, 200, status);
    }

    // POST /api/categorize
    if (req.method === 'POST' && url.pathname === '/api/categorize') {
      const body = await readJsonBody(req);
      if (typeof body.description !== 'string' || body.description.trim() === '') {
        return sendJson(res, 400, { error: 'description (non-empty string) is required' });
      }
      return sendJson(res, 200, { description: body.description, category: categorizeTransaction(body.description) });
    }

    // GET /api/goals/:id/projection
    if (req.method === 'GET' && segments[0] === 'api' && segments[1] === 'goals' && segments[3] === 'projection') {
      const goal = store.getGoal(segments[2]);
      if (!goal) {
        return sendJson(res, 404, { error: `No goal with id ${segments[2]}` });
      }
      const projection = projectSavingsGoal(goal.currentAmount, goal.targetAmount, goal.weeklyContribution);
      return sendJson(res, 200, { goal: goal.name, ...projection });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    errorCount += 1;
    return sendJson(res, 500, { error: 'Internal server error', detail: err.message });
  }
}

const server = http.createServer((req, res) => {
  requestListener(req, res).catch((err) => {
    errorCount += 1;
    sendJson(res, 500, { error: 'Internal server error', detail: err.message });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`BudgetMate API listening on port ${PORT}`);
  });
}

module.exports = server;
