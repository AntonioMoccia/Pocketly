/**
 * Una sessione aperta, come la vede il client: senza il token, che resta
 * nell'API. File a parte, senza decoratori, perche lo importa anche il
 * frontend per i tipi.
 */
export type SessionInfo = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
