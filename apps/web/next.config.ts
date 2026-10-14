import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Radice del monorepo: il pacchetto di dominio sta fuori da questa cartella.
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Il frontend non parla col database: le regole di dominio arrivano come
  // sorgente TypeScript dal pacchetto condiviso, e Next le compila.
  transpilePackages: ["@pocketly/domain"],
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  experimental: {
    serverActions: {
      // L'import CSV passa dalle Server Action: il file arriva fino a 5 MB e
      // la conferma rimanda l'anteprima intera (colonne grezze comprese), che
      // pesa diverse volte il file. Il default di 1 MB lo rompeva.
      bodySizeLimit: "30mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default withNextIntl(config);
