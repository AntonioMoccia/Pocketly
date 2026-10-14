import type { MetadataRoute } from "next";

/** Manifest PWA: l'app si installa su telefono e si apre a tutto schermo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pocketly",
    short_name: "Pocketly",
    description: "Budget multi-conto: ogni euro riceve una destinazione",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fcfcfb",
    theme_color: "#2a78d6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
