# Immagine unica: app Next, worker dei job e migrazioni nello stesso
# container. Un self-hosting non deve orchestrare tre servizi per far girare
# un'app di budget: bastano questa immagine e Postgres.

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- Dipendenze -------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# `npm ci` rispetta il lockfile: la stessa immagine ricostruita da lo stesso
# albero di dipendenze.
RUN npm ci --ignore-scripts && npm rebuild @node-rs/argon2 --foreground-scripts

# Albero di sole dipendenze di produzione: lo usano le migrazioni e il worker,
# che girano fuori dal bundle standalone di Next e hanno bisogno delle proprie
# dipendenze transitive (pg-boss, per esempio, ne porta diverse).
FROM base AS proddeps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild @node-rs/argon2 --foreground-scripts

# --- Build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Valori fittizi: servono solo a far passare la validazione in fase di build,
# a runtime arrivano quelli veri dall'ambiente.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-only-secret-build-only-secret \
    ENCRYPTION_KEY=YnVpbGQtb25seS1rZXktLWJ1aWxkLW9ubHkta2V5MTI=
RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S pocketly -u 1001

# Prima le dipendenze di produzione, poi il bundle standalone: dove i due si
# sovrappongono vince lo standalone, che porta le versioni tracciate da Next.
COPY --from=proddeps --chown=pocketly:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=pocketly:nodejs /app/.next/standalone ./
COPY --from=builder --chown=pocketly:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=pocketly:nodejs /app/public ./public

# Migrazioni e worker girano fuori dal bundle: servono i sorgenti e le
# dipendenze che li reggono.
COPY --from=builder --chown=pocketly:nodejs /app/src/db ./src/db
COPY --from=builder --chown=pocketly:nodejs /app/src/server ./src/server
COPY --from=builder --chown=pocketly:nodejs /app/src/lib ./src/lib
COPY --from=builder --chown=pocketly:nodejs /app/src/worker ./src/worker
COPY --chown=pocketly:nodejs docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh

USER pocketly
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
