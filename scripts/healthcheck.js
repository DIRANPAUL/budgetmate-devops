#!/usr/bin/env node
'use strict';

/**
 * healthcheck.js
 * -----------------------------------------------------------------------
 * Used two ways:
 *   1. As the Docker HEALTHCHECK command (no arguments — checks the local
 *      process on $PORT, matching how the container itself is configured).
 *   2. Standalone against any URL, for the Monitoring stage / manual checks:
 *        node scripts/healthcheck.js http://localhost:3100
 *
 * Exits 0 on a healthy response, exits 1 otherwise — the standard contract
 * Docker HEALTHCHECK and Jenkins `sh` steps both expect.
 * -----------------------------------------------------------------------
 */

const target = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 3000}`;
const url = `${target.replace(/\/$/, '')}/health`;
const TIMEOUT_MS = 4000;

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`Healthcheck FAILED: ${url} returned HTTP ${res.status}`);
      process.exit(1);
    }
    const body = await res.json();
    if (body.status !== 'ok') {
      console.error(`Healthcheck FAILED: unexpected body ${JSON.stringify(body)}`);
      process.exit(1);
    }
    console.log(`Healthcheck OK: ${url} — uptime ${body.uptimeSeconds}s`);
    process.exit(0);
  } catch (err) {
    console.error(`Healthcheck FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();
