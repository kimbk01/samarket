/**
 * 광고 관리자 조치 감사 한 줄 (설계 §6 · FB-A06 · AD-207 · 2026-11-04) — 공통 광고 화면(허브)·도메인 화면이 같이 쓴다.
 *
 * - 사유는 캠페인 칸에 덮어쓰지 않는다. **조치마다 감사 1행**을 남긴다.
 * - after_json 에 `reason_public`(회원·사장님에게 보임) · `reason_internal`(운영자만) · `fault`(종료) ·
 *   `refund_amount`(종료 환급) · `screen`(hub=공통 광고 화면 / domain=도메인 화면) 을 같은 이름으로 싣는다.
 * - before_json = 조치 전 상태(상태·기간·사유), after_json = 조치 후 상태 + 위 칸.
 * 서버 전용 (감사 쓰기).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

export type AdsAdminActionScreen = "hub" | "domain";

export type AdsAdminActionAuditInput = {
  actorId: string;
  targetType: string;
  targetId: string;
  /** `<대상>.<조치>` 하나 (AD-206) */
  action: string;
  screen: AdsAdminActionScreen;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reasonPublic: string | null;
  reasonInternal?: string | null;
  fault?: string | null;
  refundAmount?: number | null;
};

/** 감사 after_json 모양 (시험·이력 화면이 같은 키를 읽는다). */
export function buildAdsAdminActionAfter(input: AdsAdminActionAuditInput): Record<string, unknown> {
  return {
    ...(input.after ?? {}),
    reason: input.reasonPublic,
    reason_public: input.reasonPublic,
    reason_internal: input.reasonInternal ?? null,
    fault: input.fault ?? null,
    refund_amount: input.refundAmount ?? null,
    screen: input.screen,
  };
}

export async function appendAdsAdminActionAudit(
  sb: SupabaseClient,
  req: Request,
  input: AdsAdminActionAuditInput
): Promise<void> {
  await appendAdminRouteAudit(sb, req, {
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    before: input.before ?? {},
    after: buildAdsAdminActionAfter(input),
  });
}

const FIXED_ERROR_CODE_RE = /^[a-z][a-z0-9_]*$/;

/** AL-19: 응답 오류는 고정 코드만 — DB 원문(`error.message`)이면 서버 로그로만 보내고 `fallback` 으로 바꾼다. */
export function adsClientSafeErrorCode(error: unknown, fallback = "save_failed", logTag = "[ads-admin-action]"): string {
  const code = typeof error === "string" ? error.trim() : "";
  if (code && FIXED_ERROR_CODE_RE.test(code)) return code;
  if (error != null && error !== "") console.error(logTag, fallback, String(error));
  return fallback;
}
