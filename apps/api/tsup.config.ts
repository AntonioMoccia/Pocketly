import { defineConfig } from "tsup";

/**
 * Bundle dell'API in un solo file ESM.
 *
 * tsup compila con SWC quando il tsconfig chiede `emitDecoratorMetadata`: e
 * cio che serve alla dependency injection di Nest, che legge i tipi dei
 * parametri dei costruttori. Il pacchetto di dominio del monorepo e scritto in
 * TypeScript e senza build propria: entra nel bundle, gli altri pacchetti npm
 * restano fuori.
 */
export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  skipNodeModulesBundle: true,
  noExternal: ["@pocketly/domain"],
});
