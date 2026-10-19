/**
 * 공통 포인트 정책 변경 (board_point_policies · point_event_policies · point_probability_rules) 공용 규칙. 서버 전용.
 * - 모든 변경은 관리자 사유(2자 이상, `normalizeCommunityAdminReason`)가 필수 — 없으면 400 `reason_required`, DB 쓰기 없음.
 * - 변경 성공 후 audit_logs 에 변경 전후 + 사유를 남긴다. 기록 실패는 응답 `audit_warning: "audit_failed"` 로 알린다
 *   (커뮤니티 Admin 라우트와 같은 규칙 — 조용히 통과시키지 않는다).
 * - 런타임 지급 로직(읽기 경로)은 이 모듈을 쓰지 않는다.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";

export type PointPolicyTable = "board_point_policies" | "point_event_policies" | "point_probability_rules";

export function readPointPolicyAdminReason(raw: unknown): string | null {
  return normalizeCommunityAdminReason(raw);
}

export function pointPolicyReasonRequiredResponse(): NextResponse {
  return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
}

export async function readPointPolicyRow(
  sb: SupabaseClient,
  table: PointPolicyTable,
  id: string | null | undefined
): Promise<Record<string, unknown> | null> {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key) return null;
  const { data } = await sb.from(table).select("*").eq("id", key).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function auditPointPolicyChange(
  sb: SupabaseClient,
  req: Request,
  input: {
    actorId: string;
    targetType: string;
    targetId: string;
    action: string;
    reason: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }
): Promise<{ audit_warning?: "audit_failed" }> {
  const audit = await appendCommunityAdminAudit(sb, req, input);
  return audit.ok ? {} : { audit_warning: "audit_failed" };
}

export function pointPolicyLogNote(base: string, reason: string): string {
  return `${base} · ${reason}`.slice(0, 500);
}
