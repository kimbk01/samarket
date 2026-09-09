/**
 * Data Reset L3 one-time token — material verify + DB-backed consume.
 *
 * Material (deterministic): issueDataResetOneTimeToken / verifyDataResetOneTimeToken
 * Consume SSOT: public.data_reset_l3_token_claims (token_hash PK + plan_id UNIQUE)
 *
 * Option A: verify → atomic claim → execute.
 * Failed execute after claim requires fresh preview (new planId/token). Retry with
 * the same token is intentionally BLOCKED (replay).
 *
 * confirmationLevel >= 3 only. L1/L2 paths must not call claim.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyDataResetOneTimeToken } from "@/lib/admin/data-reset/types";

export const DATA_RESET_L3_TOKEN_CLAIMS_TABLE = "data_reset_l3_token_claims" as const;

export type DataResetL3TokenClaimResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Storage hash — never persist raw token. */
export function hashDataResetL3TokenForStorage(rawToken: string): string {
  return createHash("sha256").update(`data_reset_l3_ot_v1:${rawToken}`).digest("hex");
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const msg = String(error.message ?? "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique");
}

/**
 * Verify material binding then atomically claim (INSERT).
 * Concurrent callers: only one INSERT succeeds; loser → one_time_token_replay.
 */
export async function claimDataResetL3OneTimeToken(input: {
  sb: SupabaseClient;
  rawToken: string;
  planId: string;
  planHash: string;
  actorUserId: string;
  issuedAt: string;
  expiresAt: string;
  nowMs?: number;
}): Promise<DataResetL3TokenClaimResult> {
  const raw = String(input.rawToken ?? "");
  if (
    !verifyDataResetOneTimeToken(raw, {
      planId: input.planId,
      planHash: input.planHash,
      actorUserId: input.actorUserId,
    })
  ) {
    return { ok: false, reason: "one_time_token_invalid" };
  }

  const now = input.nowMs ?? Date.now();
  const exp = Date.parse(input.expiresAt);
  if (!Number.isFinite(exp) || exp <= now) {
    return { ok: false, reason: "one_time_token_expired" };
  }

  const tokenHash = hashDataResetL3TokenForStorage(raw);
  const consumedAt = new Date(now).toISOString();

  const { error } = await input.sb.from(DATA_RESET_L3_TOKEN_CLAIMS_TABLE).insert({
    token_hash: tokenHash,
    plan_id: input.planId,
    plan_hash: input.planHash,
    actor_user_id: input.actorUserId,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
    consumed_at: consumedAt,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "one_time_token_replay" };
    }
    return { ok: false, reason: "one_time_token_claim_failed" };
  }

  return { ok: true };
}
