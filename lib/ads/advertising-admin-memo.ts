/**
 * Admin memo persistence — INTERNAL ≠ PUBLIC.
 * Uses appendAuditLog (no new ads table). Public message updates applicant-visible fields.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { splitAdminMessages } from "@/lib/ads/admin-authority-matrix";

export type AdvertisingMemoKind = "internal" | "public";

export async function persistAdvertisingAdminMemo(
  sb: SupabaseClient,
  input: {
    adminId: string;
    adId: string;
    targetType: string;
    kind: AdvertisingMemoKind;
    memo: string;
    ip?: string | null;
    userAgent?: string | null;
    /** When public: also patch applicant-visible column on this table if provided */
    publicPatch?: {
      table: string;
      idColumn?: string;
      id: string;
      column: string;
    };
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const split = splitAdminMessages({
    internalMemo: input.kind === "internal" ? input.memo : null,
    applicantVisibleMessage: input.kind === "public" ? input.memo : null,
  });
  const text =
    input.kind === "internal" ? split.internalMemo : split.publicAdminMessage;
  if (!text) return { ok: false, error: "empty_memo" };

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminId,
    target_type: input.targetType,
    target_id: input.adId,
    action:
      input.kind === "internal"
        ? "advertising.internal_memo"
        : "advertising.public_admin_message",
    before_json: null,
    after_json: {
      kind: input.kind,
      memo: text,
      admin_id: input.adminId,
      ad_id: input.adId,
      created_at: new Date().toISOString(),
    },
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });

  if (input.kind === "public" && input.publicPatch) {
    const idCol = input.publicPatch.idColumn ?? "id";
    const { error } = await sb
      .from(input.publicPatch.table)
      .update({ [input.publicPatch.column]: text.slice(0, 500) })
      .eq(idCol, input.publicPatch.id);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
