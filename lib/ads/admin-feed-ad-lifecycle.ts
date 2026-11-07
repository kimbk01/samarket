/**
 * D-5 · D-6 · FB-M11 (Owner 「설계안대로 구현」 2026-11-04): 관리자 피드 배너 정지·재개·종료 — DB 함수 호출만.
 *
 * DB 약속(마이그레이션 담당 M · 운영 적용은 별도 승인):
 * - `admin_feed_ad_pause(p_campaign_id, p_admin_id, p_public_reason, p_internal_reason)` → {ok, status:'paused'} | {ok:false, error:'not_active'|'not_found'}
 * - `admin_feed_ad_resume(…)` → {ok, status:'active', end_at, extended_seconds} — 멈춘 시간만큼 연장(회원 유료만)
 * - `admin_feed_ad_end(p_campaign_id, p_admin_id, p_fault, p_public_reason, p_internal_reason, p_preview)` →
 *   {ok, preview, refund_points, paid_points, remaining_seconds} | {ok:false, error:'fault_required'|'already_ended'|'not_found'}
 *   운영 귀책 + 회원 유료 = floor(실제 차감 합 × 남은 초 / 전체 초) 환급 · 원장 id `feed-ad-end-refund:<campaignId>` 고정
 *
 * 결과(jsonb)는 그대로 돌려준다. 오류 코드는 `feedAdLifecycleErrorMessageKo` 로 한국어로 바꿔 화면에 보인다.
 * 공개 사유(회원에게 보임 · 120자) ≠ 내부 메모(어드민만). 회원 응답에는 공개 사유만 나간다.
 * 어드민 화면·라우트 연결은 담당 A.
 *
 * D-14 (광고 3차 재감사 · 2026-11-07): 세 함수 모두 마지막 인자 `p_screen`(조치한 화면)을 넘긴다.
 * 감사는 DB 함수가 같은 트랜잭션에서 1행만 쓴다 (대상 = 신청 있으면 feed_ad_request/신청 id, 없으면 feed_ad_campaign/캠페인 id ·
 * after_json.screen). 호출하는 TS 는 정지·재개·종료 감사를 따로 쓰지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { feedAdErrorMessageKo } from "@/lib/ads/feed-ad-error-copy";

export const FEED_AD_PUBLIC_REASON_MAX = 120;
export type FeedAdEndFault = "operator" | "member" | "none";

export type AdminFeedAdLifecycleResult = { ok: boolean; error?: string; message?: string } & Record<string, unknown>;

type ReasonInput = {
  campaignId: string;
  adminUserId: string;
  publicReason?: string | null;
  internalReason?: string | null;
  /** D-14: 조치한 화면 (감사 after_json.screen) */
  screen?: string | null;
};

function screenArg(input: ReasonInput): string | null {
  const s = String(input.screen ?? "").trim();
  return s ? s.slice(0, 64) : null;
}

function cleanReasons(input: ReasonInput):
  | { ok: true; publicReason: string | null; internalReason: string | null }
  | { ok: false; error: string } {
  const publicReason = String(input.publicReason ?? "").trim();
  const internalReason = String(input.internalReason ?? "").trim();
  if (publicReason.length > FEED_AD_PUBLIC_REASON_MAX) return { ok: false, error: "public_reason_too_long" };
  return {
    ok: true,
    publicReason: publicReason || null,
    internalReason: internalReason ? internalReason.slice(0, 500) : null,
  };
}

function fail(error: string): AdminFeedAdLifecycleResult {
  return { ok: false, error, message: feedAdLifecycleErrorMessageKo(error) };
}

async function callRpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<AdminFeedAdLifecycleResult> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return fail("rpc_failed");
  const out = (data ?? {}) as Record<string, unknown>;
  if (out.ok === false) {
    const code = String(out.error ?? "failed");
    return { ...out, ok: false, error: code, message: feedAdLifecycleErrorMessageKo(code) };
  }
  return { ...out, ok: true };
}

export async function adminPauseFeedAd(sb: SupabaseClient, input: ReasonInput): Promise<AdminFeedAdLifecycleResult> {
  if (!input.campaignId?.trim() || !input.adminUserId?.trim()) return fail("not_found");
  const r = cleanReasons(input);
  if (!r.ok) return fail(r.error);
  return callRpc(sb, "admin_feed_ad_pause", {
    p_campaign_id: input.campaignId.trim(),
    p_admin_id: input.adminUserId.trim(),
    p_public_reason: r.publicReason,
    p_internal_reason: r.internalReason,
    p_screen: screenArg(input),
  });
}

export async function adminResumeFeedAd(sb: SupabaseClient, input: ReasonInput): Promise<AdminFeedAdLifecycleResult> {
  if (!input.campaignId?.trim() || !input.adminUserId?.trim()) return fail("not_found");
  const r = cleanReasons(input);
  if (!r.ok) return fail(r.error);
  return callRpc(sb, "admin_feed_ad_resume", {
    p_campaign_id: input.campaignId.trim(),
    p_admin_id: input.adminUserId.trim(),
    p_public_reason: r.publicReason,
    p_internal_reason: r.internalReason,
    p_screen: screenArg(input),
  });
}

export async function adminEndFeedAd(
  sb: SupabaseClient,
  input: ReasonInput & { fault: FeedAdEndFault | string | null | undefined; preview?: boolean }
): Promise<AdminFeedAdLifecycleResult> {
  if (!input.campaignId?.trim() || !input.adminUserId?.trim()) return fail("not_found");
  const fault = String(input.fault ?? "").trim();
  if (fault !== "operator" && fault !== "member" && fault !== "none") return fail("fault_required");
  const r = cleanReasons(input);
  if (!r.ok) return fail(r.error);
  return callRpc(sb, "admin_feed_ad_end", {
    p_campaign_id: input.campaignId.trim(),
    p_admin_id: input.adminUserId.trim(),
    p_fault: fault,
    p_public_reason: r.publicReason,
    p_internal_reason: r.internalReason,
    p_preview: input.preview === true,
    p_screen: screenArg(input),
  });
}

const LIFECYCLE_KO: Record<string, string> = {
  not_active: "진행 중인 배너가 아니라 멈출 수 없습니다.",
  not_paused: "멈춘 배너가 아니라 다시 시작할 수 없습니다.",
  not_found: "배너를 찾지 못했습니다.",
  fault_required: "귀책(운영·회원·없음)을 골라 주세요.",
  already_ended: "이미 종료된 배너입니다.",
  public_reason_too_long: `공개 사유는 ${FEED_AD_PUBLIC_REASON_MAX}자 이하로 써 주세요.`,
  rpc_failed: "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

/** 정지·재개·종료 오류 코드 → 한국어 (표에 없으면 피드 배너 공통 문구) */
export function feedAdLifecycleErrorMessageKo(code: string | null | undefined): string {
  const c = String(code ?? "").trim();
  return LIFECYCLE_KO[c] ?? feedAdErrorMessageKo(c);
}
