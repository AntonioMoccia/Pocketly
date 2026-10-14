"use client";

import { useEffect } from "react";

/**
 * Registra il service worker che rende l'app installabile.
 *
 * La cache e volutamente minima: un'app di saldi deve mostrare dati freschi,
 * non una copia di ieri. Il worker serve il guscio e una pagina di cortesia
 * quando manca la rete.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Un'installazione dietro HTTP senza TLS non registra il worker:
        // l'app funziona comunque, semplicemente non si installa.
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
