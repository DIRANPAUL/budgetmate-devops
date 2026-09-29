#!/usr/bin/env bash
# alert-on-failure.sh
# -----------------------------------------------------------------------
# Lightweight, in-pipeline monitoring check run as a Jenkins post-build
# action immediately after a production release (Jenkinsfile "Monitoring"
# stage) — this is a fast, synchronous check that complements the
# asynchronous Prometheus/Alertmanager stack in this folder, which
# continues polling on its own 15s scrape interval after the pipeline run
# has finished.
#
# Usage: monitoring/alert-on-failure.sh <target-url> [<slack-webhook-url>]
# Exit code 0 = healthy, 1 = unhealthy (fails the Jenkins post-build stage
# and, if BUILD_URL is set by Jenkins, includes it in the alert message).
# -----------------------------------------------------------------------
set -euo pipefail

TARGET_URL="${1:?Usage: alert-on-failure.sh <target-url> [<webhook-url>]}"
WEBHOOK_URL="${2:-}"

echo "Monitoring stage: checking ${TARGET_URL}/health ..."

if node "$(dirname "$0")/../scripts/healthcheck.js" "$TARGET_URL"; then
  echo "Monitoring stage: service healthy."
  exit 0
fi

MESSAGE="🚨 BudgetMate API healthcheck FAILED at ${TARGET_URL} (build: ${BUILD_URL:-local run}, time: $(date -u +%FT%TZ))"
echo "$MESSAGE" >&2

if [[ -n "$WEBHOOK_URL" ]]; then
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"text\": \"${MESSAGE}\"}" \
    "$WEBHOOK_URL" || echo "Warning: failed to deliver alert to webhook" >&2
else
  echo "No webhook URL configured — alert logged to Jenkins console output only." >&2
fi

exit 1
