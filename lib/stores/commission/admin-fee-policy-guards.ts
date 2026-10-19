/**
 * Admin 수수료 정책 쓰기 공통 가드 — 감사 기록(DEF-2) · 플랫폼 기본 정책 공백 방지(DEF-62).
 * 수수료 금액 계산은 DB 트리거 권위 — 여기서는 정책 행 변경만 다룬다.
 */

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";

export async function auditAdminFeePolicyWrite(
  sb: SupabaseClient,
  req: NextRequest,
  input: {
    actorId: string | null;
    action:
      | "store_fee_policy.create"
      | "store_fee_policy.update"
      | "store_fee_policy.archive"
      | "store_fee_policy.supersede";
    policyId: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason?: string | null;
  }
): Promise<void> {
  const rm = getAuditRequestMeta(req);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.actorId,
    target_type: "store_fee_policy",
    target_id: input.policyId ?? "",
    action: input.action,
    before_json: input.before,
    after_json: { ...(input.after ?? {}), reason: input.reason ?? null },
    ip: rm.ip ?? null,
    user_agent: rm.userAgent ?? null,
  });
}

function isDefaultScope(row: {
  store_id?: string | null;
  category_id?: string | null;
  topic_id?: string | null;
}): boolean {
  return !row.store_id && !row.category_id && !row.topic_id;
}

/**
 * 플랫폼 기본(전체 범위) 정책을 끄거나 보관할 때, 지금 시점에 유효한 다른 기본 정책이 없으면 거부.
 * 기본 정책이 없으면 트리거가 `store_commission_policy_missing` 으로 주문 진행을 막는다.
 */
export async function assertDefaultFeePolicyRemainsAfterDeactivate(
  sb: SupabaseClient,
  target: {
    id: string;
    store_id?: string | null;
    category_id?: string | null;
    topic_id?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: "would_leave_no_default_policy" }> {
  if (!isDefaultScope(target)) return { ok: true };
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("store_fee_policies")
    .select("id, starts_at, ends_at")
    .is("store_id", null)
    .is("category_id", null)
    .eq("is_active", true)
    .eq("is_archived", false)
    .neq("id", target.id)
    .limit(50);
  if (error) {
    // 조회 실패 시 안전 측 — 기본 정책 비활성화를 막는다.
    return { ok: false, error: "would_leave_no_default_policy" };
  }
  const now = Date.parse(nowIso);
  const covered = (data ?? []).some((row) => {
    const s = row.starts_at ? Date.parse(String(row.starts_at)) : -Infinity;
    const e = row.ends_at ? Date.parse(String(row.ends_at)) : Infinity;
    return s <= now && now < e;
  });
  return covered ? { ok: true } : { ok: false, error: "would_leave_no_default_policy" };
}
