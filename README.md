# BudgetMate API — DevOps Pipeline (SIT223/SIT753 7.3HD)

BudgetMate is a bank-linked budgeting app concept for Australian university
students (Team 7's SIT317 capstone product). This repository is the
project chosen for the 7.3HD DevOps task: a small but genuinely functional
**Node.js REST API** implementing BudgetMate's core budgeting engine —
Consumer-Data-Right-style transaction auto-categorisation, per-category
budget-status calculation, and savings-goal projection — wired up to a
full **7-stage Jenkins pipeline** (Build, Test, Code Quality, Security,
Deploy, Release, Monitoring).

## Why this project fits the task's Appendix I criteria

- **Functional depth**: real back-end logic in `lib/budgetLogic.js`
  (categorisation rules, budget-status maths, goal projection), not static
  content — exercised through a real REST API in `server.js`.
- **Automatable tech stack**: plain Node.js + Docker; builds with
  `npm test` / `docker build`, no bespoke toolchain.
- **Testable**: 25 automated tests (`test/`) covering both the pure
  business logic and the HTTP layer, run with Node's built-in test runner
  — 97.4% line coverage on the last local run (`node --test
  --experimental-test-coverage`).
- **Deployable**: a multi-stage `Dockerfile` produces a minimal,
  non-root runtime image; `docker-compose.staging.yml` /
  `docker-compose.prod.yml` deploy it.
- **Monitorable**: a built-in `/metrics` endpoint in Prometheus exposition
  format, scraped by the Prometheus + Alertmanager stack in `monitoring/`.

## Tech stack

| Concern | Tool |
|---|---|
| Runtime | Node.js 22 (built-in `http` module — zero runtime dependencies, see `SECURITY.md`) |
| Testing | Node's built-in test runner (`node:test`, `node:assert`) — JUnit XML output |
| Code quality | ESLint 9 (flat config, `eslint.config.js`) + SonarQube (`sonar-project.properties`) |
| Security | `npm audit` (dependency tree) + Trivy (container image) — see `SECURITY.md` |
| Containerisation | Docker (multi-stage `Dockerfile`) |
| Deployment | Docker Compose (`docker-compose.staging.yml`, `docker-compose.prod.yml`) |
| Release | Git tags + generated `RELEASE_NOTES.md` (`scripts/generate-release-notes.js`) |
| Monitoring | Prometheus + Alertmanager (`monitoring/`) + a synchronous post-deploy healthcheck (`monitoring/alert-on-failure.sh`) |
| CI/CD orchestration | Jenkins declarative pipeline (`Jenkinsfile`) |

## Running it locally (without Jenkins)

```bash
npm install         # installs the one devDependency, eslint
npm test            # 25 tests, node's built-in runner + JUnit report
npm run lint         # eslint . — 0 errors on a clean checkout
node server.js       # starts the API on http://localhost:3000
```

Try it:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/transactions
curl http://localhost:3000/api/budgets/Groceries/status
curl -X POST http://localhost:3000/api/categorize \
  -H 'content-type: application/json' \
  -d '{"description":"Woolworths Burwood"}'
```

## Running the full Jenkins pipeline

See **`RUNNING.md`** for exact, copy-paste steps to stand up a local
Jenkins instance with the required plugins, connect it to this repository,
and run the pipeline end to end — producing the real screenshot and demo
video this task requires as evidence.

## Project structure

```
server.js                   HTTP API (routing + handlers)
lib/budgetLogic.js          Pure business logic (unit tested)
lib/store.js                In-memory data store (seed data)
test/                       25 automated tests (unit + integration)
scripts/                    healthcheck.js, smoke-check.js, generate-release-notes.js
monitoring/                 Prometheus, Alertmanager, alert-on-failure.sh
Dockerfile                  Multi-stage build (test -> minimal runtime image)
docker-compose.staging.yml  Deploy-stage target
docker-compose.prod.yml     Release-stage target
Jenkinsfile                 The 7-stage pipeline itself
SECURITY.md                 Security-scanning policy and how findings are handled
eslint.config.js            Code Quality stage configuration
sonar-project.properties    SonarQube configuration
```

## Author

Diran Shenuk Paul De Silva Jayasinghage (s224764189) — Deakin University.
