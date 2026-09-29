#!/usr/bin/env node
'use strict';

/**
 * smoke-test.js
 * -----------------------------------------------------------------------
 * Post-deploy smoke test run by the Jenkins "Deploy" stage immediately
 * after `docker compose -f docker-compose.staging.yml up -d --build`, to
 * confirm the freshly deployed container is actually serving real traffic
 * correctly before the pipeline is allowed to proceed to Release.
 *
 * Usage: node scripts/smoke-test.js http://localhost:3100
 * Exits non-zero (failing the Jenkins stage) on any check failure.
 * -----------------------------------------------------------------------
 */

const base = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failures += 1;
  }
}

async function main() {
  console.log(`Running smoke test against ${base} ...`);

  const health = await fetch(`${base}/health`).then((r) => ({ status: r.status, body: r.json() }));
  check('GET /health returns 200', health.status === 200);
  const healthBody = await health.body;
  check('GET /health reports status "ok"', healthBody.status === 'ok');

  const txns = await fetch(`${base}/api/transactions`);
  check('GET /api/transactions returns 200', txns.status === 200);
  const txnsBody = await txns.json();
  check('GET /api/transactions returns a non-empty list', Array.isArray(txnsBody.transactions) && txnsBody.transactions.length > 0);

  const categorize = await fetch(`${base}/api/categorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'Woolworths Burwood' }),
  });
  const categorizeBody = await categorize.json();
  check('POST /api/categorize returns 200', categorize.status === 200);
  check('POST /api/categorize correctly categorises a known merchant', categorizeBody.category === 'Groceries');

  const metrics = await fetch(`${base}/metrics`);
  check('GET /metrics returns 200 (Monitoring stage dependency)', metrics.status === 200);

  console.log('');
  if (failures > 0) {
    console.error(`Smoke test FAILED: ${failures} check(s) did not pass.`);
    process.exit(1);
  }
  console.log('Smoke test PASSED: all checks succeeded.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`Smoke test FAILED: could not reach ${base} (${err.message})`);
  process.exit(1);
});
