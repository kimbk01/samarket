import type { SupabaseClient } from "@supabase/supabase-js";

type AssignRpcResult = {
  ok?: boolean;
  error?: string;
  dibay_id?: string;
  idempotent?: boolean;
  skipped?: boolean;
};

export type AssignAutoDibayIdOutcome =
  | { ok: true; dibay_id: string; idempotent?: boolean; skipped?: boolean }
  | { ok: false; error: string };

/**
 * Server-only — assigns dibay_[hex6] when profile has no user-confirmed @id.
 * Skips locked/custom-confirmed rows (RPC no-op).
 */
export async function assignAutoDibayIdForUser(
  sb: SupabaseClient,
  userId: string
): Promise<AssignAutoDibayIdOutcome> {
  const uid = userId.trim();
  if (!uid) {
    return { ok: false, error: "user_id_required" };
  }

  const { data, error } = await sb.rpc("assign_auto_dibay_id", { p_user_id: uid });
  if (error) {
    const msg = error.message ?? "assign_failed";
    if (msg.includes("assign_auto_dibay_id") || msg.includes("does not exist")) {
      return { ok: false, error: "assign_rpc_unavailable" };
    }
    return { ok: false, error: msg };
  }

  const result = (data ?? {}) as AssignRpcResult;
  if (!result.ok) {
    return { ok: false, error: String(result.error ?? "assign_failed") };
  }

  return {
    ok: true,
    dibay_id: String(result.dibay_id ?? ""),
    idempotent: result.idempotent === true,
    skipped: result.skipped === true,
  };
}

/** Profile read/ensure — assign when dibay_id missing; failures are non-fatal. */
export async function ensureAutoDibayIdAssigned(
  sb: SupabaseClient,
  userId: string
): Promise<string | null> {
  const outcome = await assignAutoDibayIdForUser(sb, userId);
  if (!outcome.ok) return null;
  return outcome.dibay_id.trim() || null;
}
