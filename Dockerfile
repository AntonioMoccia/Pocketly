# Due immagini dallo stesso Dockerfile, una per servizio:
#   docker build --target api .   -> API NestJS: database, migrazioni, job
#   docker build --target web .   -> frontend Next.js, parla solo con l'API
# docker compose le costruisce entrambe.

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- Dipendenze -------------------------------------------------------------
# Solo i manifest: la cache di questo strato si invalida quando cambiano le
# dipendenze, non a ogni modifica del codice.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/

FROM manifests AS deps
# `npm ci` rispetta il lockfile: la stessa immagine ricostruita da lo stesso
# albero di dipendenze.
RUN npm ci --ignore-scripts && npm rebuild @node-rs/argon2 --foreground-scripts

# Dipendenze di produzione dell'API: le migrazioni e il bundle tengono fuori i
# pacchetti npm, quindi a runtime servono installati.
FROM manifests AS api-deps
RUN npm ci --omit=dev --workspace=@pocketly/api --ignore-scripts \
  && npm rebuild @node-rs/argon2 --foreground-scripts

# --- Build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @pocketly/api && npm run build -w @pocketly/web

# --- API --------------------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production \
    API_PORT=4000 \
    API_HOST=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S pocketly -u 1001

COPY --from=api-deps --chown=pocketly:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=pocketly:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=pocketly:nodejs /app/apps/api/dist ./apps/api/dist
# Le migrazioni girano dai sorgenti, prima che l'API accetti richieste.
COPY --from=builder --chown=pocketly:nodejs /app/apps/api/src/db ./apps/api/src/db
COPY --chown=pocketly:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER pocketly
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]

# --- Frontend ---------------------------------------------------------------
FROM base AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S pocketly -u 1001

# Il bundle standalone riproduce il monorepo: il server sta in apps/web.
COPY --from=builder --chown=pocketly:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=pocketly:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=pocketly:nodejs /app/apps/web/public ./apps/web/public

USER pocketly
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
