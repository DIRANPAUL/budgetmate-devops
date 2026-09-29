# Security scanning approach — BudgetMate API

This document is the source of truth the "Security" stage of the Jenkinsfile
implements, and what the 7.3HD answer sheet's per-stage description
summarises. It covers dependency scanning, container scanning, and the
container-hardening controls already built into the Dockerfile.

## 1. Dependency scanning (`npm audit`)

The API ships with **zero runtime dependencies** (see `package.json` —
`dependencies: {}`), by deliberate design: the whole HTTP layer is built on
Node's built-in `http`/`url` modules rather than a framework. This is a real
security decision, not an artefact of the pipeline exercise — every runtime
dependency is a piece of someone else's code running in production with the
same privileges as the app, and the npm ecosystem's supply chain has been
the source of repeated real-world incidents (typosquatting, compromised
maintainer accounts, protestware). Keeping the runtime dependency graph at
zero removes that attack surface entirely for the parts of the app that
actually run in production.

The one dependency that does exist is a **devDependency**, `eslint`, used
only in the Code Quality stage and never shipped in the runtime image (the
Dockerfile's runtime stage only copies `server.js`, `lib/`, `scripts/` and
`package*.json` — see `Dockerfile`). The Security stage still audits it:

```bash
npm audit --omit=dev --audit-level=high   # production dependency tree — expected: 0 dependencies, 0 findings, by design
npm audit --audit-level=high              # full tree including devDependencies (eslint) — tooling-chain CVEs only, never shipped
```

**How findings are handled**, per the task sheet's requirement to explain
what/severity/remediation for anything found:

| Step | Action |
|---|---|
| 1 | `npm audit --audit-level=high` runs in the Security stage; Jenkins captures the JSON report as a build artefact. |
| 2 | Any `high`/`critical` finding fails the stage (`exit 1`) so it cannot silently reach Deploy. |
| 3 | If the finding is a real vulnerability in code that's actually reachable at runtime, the fix is to bump the dependency to the patched version and re-run the pipeline from Build. |
| 4 | If the finding is a false positive or in a dev-only tool with no production exposure (e.g. an ESLint transitive dependency), it is documented here with the CVE ID, why it's a false positive/non-exploitable in this context, and excluded via `npm audit --omit=dev` in the stage that gates the Deploy step — the full-tree audit still runs and is still reported, it just doesn't block. |

No findings exist as of the last local audit for the same reason the
production dependency tree audits clean by definition (it's empty); this
section is written so a real finding — which will appear the moment a real
dependency is added — has a documented, repeatable process rather than
being handled ad hoc.

## 2. Container image scanning (Trivy)

The Deploy-stage build artefact is a Docker image (`budgetmate-api:$BUILD_NUMBER`,
see `Dockerfile`). Before that image is allowed to reach the Deploy stage,
the Security stage scans it with [Trivy](https://trivy.dev):

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 budgetmate-api:$BUILD_NUMBER
```

This catches OS-package-level CVEs in the base image (`node:22-alpine`)
that `npm audit` cannot see, since `npm audit` only inspects the Node
dependency graph. `--exit-code 1` fails the Jenkins stage on any
high/critical finding, following the same what/severity/remediation
process as above: bump the base image tag if the fix is upstream, or
document and justify an exception if it is a non-exploitable finding in a
package the app never invokes (e.g. a CLI tool bundled in the base image
but never executed by `server.js`).

## 3. Container hardening (defence in depth, independent of scan results)

These are structural controls in `Dockerfile`, not scan output, but they
are what most directly reduce the blast radius of anything a scanner might
miss:

- **Multi-stage build** — the final runtime image contains no build
  tooling, no `devDependencies`, and no test files; only `server.js`,
  `lib/`, `scripts/` and the production `package.json`.
- **Non-root user** — the container runs as the unprivileged `budgetmate`
  user (`USER budgetmate`), not root, so a container-escape or RCE finding
  cannot trivially escalate to host-root-equivalent privileges inside the
  container.
- **Minimal base image** — `node:22-alpine` rather than a full Debian/Ubuntu
  base, to minimise the OS package surface Trivy has to scan in the first
  place.
- **`HEALTHCHECK`** — lets the orchestrator (Docker/Jenkins) detect and
  restart a container that has crashed or hung, which is an availability
  control that complements the alerting configured in `monitoring/`.

## 4. What "Code Quality" deliberately does *not* cover

Per the task sheet's own note: ESLint (the Code Quality stage's tool) is
configured here for structure/style/maintainability — unused variables,
`==` vs `===`, `var` usage, consistent control flow (`eslint.config.js`) —
and is not relied on for security findings, even though it can
incidentally flag a handful of insecure patterns. That responsibility sits
entirely with `npm audit` + Trivy in this Security stage, kept as a
separate pipeline stage so a code-quality regression and a security
regression are never confused with one another in the build history.
