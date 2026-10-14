/**
 * Membri e inviti dell'household letti dall'API.
 */
import { api } from "@/lib/api";
import type { MemberRow } from "@api/data/household";

export type { MemberRow };

export type InviteRow = {
  id: string;
  role: MemberRow["role"];
  email: string | null;
  expiresAt: Date;
  createdAt: Date;
};

export function listMembers(): Promise<MemberRow[]> {
  return api.get<MemberRow[]>("/household/members");
}

/** Solo per l'owner. Le date arrivano come testo nel JSON: tornano `Date`. */
export async function listInvites(): Promise<InviteRow[]> {
  const rows = await api.get<(Omit<InviteRow, "expiresAt" | "createdAt"> & {
    expiresAt: string;
    createdAt: string;
  })[]>("/household/invites");
  return rows.map((row) => ({
    ...row,
    expiresAt: new Date(row.expiresAt),
    createdAt: new Date(row.createdAt),
  }));
}
