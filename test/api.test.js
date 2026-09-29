'use strict';

/**
 * Integration tests: start the real HTTP server on an ephemeral port and
 * exercise it with real requests via the global fetch API (Node 18+).
 * This is what the Jenkins "Test" stage runs in CI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');

async function withServer(fn) {
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /health returns 200 with an ok status', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptimeSeconds, 'number');
  });
});

test('GET /metrics returns Prometheus exposition text', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/metrics`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /budgetmate_uptime_seconds \d+/);
    assert.match(text, /budgetmate_requests_total \d+/);
  });
});

test('GET /api/transactions returns seeded transactions, newest first', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/transactions`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.transactions));
    assert.ok(body.transactions.length >= 8);
    const dates = body.transactions.map((t) => t.date);
    const sorted = [...dates].sort().reverse();
    assert.deepEqual(dates, sorted);
  });
});

test('POST /api/transactions creates and auto-categorises a transaction', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Woolworths Metro Deakin', amount: -18.4 }),
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.transaction.category, 'Groceries');
    assert.equal(body.transaction.amount, -18.4);
  });
});

test('POST /api/transactions rejects a malformed body', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Missing amount' }),
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/budgets/:category/status returns spend vs limit', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/budgets/${encodeURIComponent('Rent & Bills')}/status`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.category, 'Rent & Bills');
    assert.equal(body.limit, 260);
    assert.ok(['ok', 'warning', 'over'].includes(body.status));
  });
});

test('GET /api/budgets/:category/status 404s for an unknown category', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/budgets/Crypto/status`);
    assert.equal(res.status, 404);
  });
});

test('POST /api/categorize categorises an arbitrary description', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/categorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'HOYTS CINEMA CHADSTONE' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.category, 'Entertainment');
  });
});

test('GET /api/goals/:id/projection returns a weeks-remaining projection', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/goals/2/projection`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.goal, 'End-of-trimester trip');
    assert.equal(typeof body.weeksRemaining, 'number');
  });
});

test('GET /api/goals/:id/projection 404s for an unknown goal id', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/goals/999/projection`);
    assert.equal(res.status, 404);
  });
});

test('GET on an unknown route returns 404', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});
