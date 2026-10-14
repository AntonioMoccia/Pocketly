import type { MetadataRoute } from "next";

/**
 * Un'istanza di Pocketly contiene dati finanziari personali: non va indicizzata.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
