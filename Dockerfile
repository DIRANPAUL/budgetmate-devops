# BudgetMate API — production container image
# Multi-stage build: stage 1 runs the test suite so a broken build can never
# be tagged as a deployable artefact; stage 2 produces the minimal runtime
# image that the Deploy/Release stages promote through environments.

# ---------- Stage 1: build & test ----------
FROM node:22-alpine AS build
WORKDIR /app

# Zero runtime dependencies today, but keep the real install step so this
# still works the moment a dependency is added.
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm test

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Run as a non-root user — a deliberate, documented Security-stage control
# (see SECURITY.md, "Container hardening").
RUN addgroup -S budgetmate && adduser -S budgetmate -G budgetmate

COPY --from=build /app/package*.json ./
COPY --from=build /app/server.js ./
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts

USER budgetmate
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node scripts/healthcheck.js || exit 1

CMD ["node", "server.js"]
