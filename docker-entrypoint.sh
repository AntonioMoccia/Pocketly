#!/bin/sh
# Avvio dell'API: prima le migrazioni, poi il server. Lo schema e sempre
# aggiornato prima che arrivi la prima richiesta (F1.1).
set -e

echo "Pocketly API: applico le migrazioni..."
node --experimental-strip-types apps/api/src/db/migrate.mts

# I job pianificati partono dentro l'API; DISABLE_JOBS=true li spegne.
echo "Pocketly API: avvio sulla porta ${API_PORT:-4000}."
exec node apps/api/dist/main.js
