# syntax=docker/dockerfile:1
# A&E NOVA Reservierungen – Produktions-Image (Next.js standalone)
# Debian-basiert (glibc), weil @node-rs/argon2 native Binaries mitbringt.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Prisma lädt beim Generieren die Konfiguration – eine Platzhalter-URL genügt (keine Verbindung)
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# Einmal-Job für Datenbank-Migrationen: docker compose run --rm migrate
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 nova && mkdir -p /app/.media && chown nova /app/.media
COPY --from=build --chown=nova /app/.next/standalone ./
COPY --from=build --chown=nova /app/.next/static ./.next/static
COPY --from=build --chown=nova /app/public ./public
USER nova
EXPOSE 3000
CMD ["node", "server.js"]
