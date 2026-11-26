/**
 * 회원 배너 신청 취소 — DB 함수 `member_cancel_feed_ad_request` 1회 (광고 DB 묶음 B-DB · R-24 · 2026-11-27).
 *
 * 예전: TS 가 상태 변경 → 보류 해제를 따로 해서, 중간 실패면 「취소됨 + 포인트 묶임」이 남을 수 있었다.
 * 지금: 한 트랜잭션 — 검토 중·본인·승인 시작 전(또는 10분 지난 죽은 claim)만 · 확정(captured) 보류가 있으면 거부 ·
 *       보류 해제(원장 `release:<hold>`) + 상태 cancelled.
 * 두 번 취소: 두 번째는 not_pending (중복 환급 없음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 승인 claim 이 이 시간보다 오래되면 죽은 승인으로 본다 (서버 함수 최대 실행 시간보다 넉넉히) */
export const FEED_AD_REVIEW_CLAIM_STALE_MS = 10 * 60 * 1000;

export type CancelFeedAdRequestResult =
  | { ok: true; status: "cancelled"; releasedPoints: number }
  | { ok: false; error: string; httpStatus: number };

const HTTP_BY_ERROR: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  not_pending: 409,
};

export async function cancelFeedAdRequest(
  sb: SupabaseClient,
  params: { requestId: string; userId: string }
): Promise<CancelFeedAdRequestResult> {
  const requestId = params.requestId.trim();
  if (!requestId) {
    return { ok: false, error: "missing_id", httpStatus: 400 };
  }
  const { data, error } = await sb.rpc("member_cancel_feed_ad_request", {
    p_user: params.userId,
    p_request: requestId,
    p_claim_stale_seconds: Math.floor(FEED_AD_REVIEW_CLAIM_STALE_MS / 1000),
  });
  if (error || !data || typeof data !== "object") {
    return { ok: false, error: "cancel_failed", httpStatus: 500 };
  }
  const r = data as { ok?: boolean; error?: string; released_points?: number };
  if (r.ok === true) {
    return { ok: true, status: "cancelled", releasedPoints: Math.max(0, Math.floor(Number(r.released_points) || 0)) };
  }
  const code = String(r.error ?? "cancel_failed");
  return { ok: false, error: code, httpStatus: HTTP_BY_ERROR[code] ?? 500 };
}
