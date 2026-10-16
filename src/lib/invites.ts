import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { accountsDb } from "./accounts";

/**
 * Invite links (/join/<code>), made by the main library's owner in Settings. Each works once and
 * for INVITE_DAYS. The code is shown when it's made; after that only its hash is kept.
 */

export const INVITE_DAYS = 14;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

export type Invite = { id: string; note: string; createdAt: number; expiresAt: number; usedAt: number | null; usedBy: string | null };

/** Makes an invite and returns its code. */
export async function createInvite(createdBy: number, note: string): Promise<string> {
  const code = randomBytes(18).toString("base64url");
  const now = Date.now();
  await accountsDb.run(
    "INSERT INTO invites (code_hash, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    hash(code),
    note.trim().slice(0, 80),
    createdBy,
    now,
    now + INVITE_DAYS * 86_400_000,
  );
  return code;
}

/** Invites that can still be used, newest first. */
export async function openInvites(): Promise<Invite[]> {
  const rows = await accountsDb.all(
    `SELECT i.code_hash, i.note, i.created_at, i.expires_at, i.used_at, a.email AS used_by
     FROM invites i LEFT JOIN accounts a ON a.id = i.used_by
     WHERE i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC`,
    Date.now(),
  );
  return rows.map((r) => ({
    id: String(r.code_hash).slice(0, 16),
    note: String(r.note),
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    usedAt: r.used_at == null ? null : Number(r.used_at),
    usedBy: (r.used_by as string) ?? null,
  }));
}

/** Cancels an unused invite, by the start of its hash (as listInvites gives it). */
export async function revokeInvite(id: string) {
  await accountsDb.run("DELETE FROM invites WHERE substr(code_hash, 1, 16) = ? AND used_at IS NULL", id);
}

/** Whether a code can still be used. */
export async function inviteIsOpen(code: string): Promise<boolean> {
  return !!(await accountsDb.get("SELECT 1 AS ok FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?", hash(code), Date.now()))?.ok;
}

/** Takes the invite for one sign-up, so two people can't use it at once. False when it's used, expired or unknown. */
export async function takeInvite(code: string): Promise<boolean> {
  const now = Date.now();
  const { changes } = await accountsDb.run("UPDATE invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?", now, hash(code), now);
  return changes === 1;
}

/** Gives the invite back after a sign-up that failed part way. */
export async function returnInvite(code: string) {
  await accountsDb.run("UPDATE invites SET used_at = NULL WHERE code_hash = ? AND used_by IS NULL", hash(code));
}

export async function inviteUsedBy(code: string, accountId: number) {
  await accountsDb.run("UPDATE invites SET used_by = ? WHERE code_hash = ?", accountId, hash(code));
}
