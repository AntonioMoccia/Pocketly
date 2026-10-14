#!/bin/sh
# Avvio del container: prima le migrazioni, poi il server. Lo schema e sempre
# aggiornato prima che arrivi la prima richiesta (F1.1).
set -e

echo "Pocketly: applico le migrazioni..."
node --experimental-strip-types src/db/migrate.mts

# I job pianificati partono dentro il server (src/instrumentation.ts): un solo
# processo da sorvegliare, e DISABLE_JOBS=true li spegne.
echo "Pocketly: avvio il server sulla porta ${PORT:-3000}."
exec node server.js
