/**
 * Member cancel: pending_review → RELEASE (PHASE 1 writer) → cancelled.
 * Double-cancel: second CAS fails with not_pending (no duplicate credit).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseHeldPointsForFeedAdRequest } from "@/lib/ads/feed-ad-request-point-flow";

/** 승인 claim 이 이 시간보다 오래되면 죽은 승인으로 본다 (서버 함수 최대 실행 시간보다 넉넉히) */
export const FEED_AD_REVIEW_CLAIM_STALE_MS = 10 * 60 * 1000;

export type CancelFeedAdRequestResult =
  | { ok: true; status: "cancelled" }
  | { ok: false; error: string; httpStatus: number };

export async function cancelFeedAdRequest(
  sb: SupabaseClient,
  params: { requestId: string; userId: string }
): Promise<CancelFeedAdRequestResult> {
  const requestId = params.requestId.trim();
  if (!requestId) {
    return { ok: false, error: "missing_id", httpStatus: 400 };
  }

  const { data: reqRow, error: fetchErr } = await sb
    .from("feed_ad_requests")
    .select("id, status, user_id, reviewed_by, reviewed_at")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchErr || !reqRow) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }
  const row = reqRow as { user_id?: string; status?: string; reviewed_by?: string | null; reviewed_at?: string | null };
  if (String(row.user_id) !== params.userId) {
    return { ok: false, error: "forbidden", httpStatus: 403 };
  }
  if (String(row.status) !== "pending_review") {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }
  /**
   * 광고 감사 FB-15·R-04·R-05 (2026-11-26):
   * - 어드민이 승인을 시작한 신청(`reviewed_by` 있음)은 회원 취소를 받지 않는다(승인 확정과 겹침 방지).
   * - 단 승인이 중간에 죽어 claim 만 남은 경우(검토 시작 후 10분 경과)는 취소를 받는다 — 회원이 영구히 못 빼는 상태 방지.
   */
  const claimedBy = row.reviewed_by ?? null;
  const claimStale =
    claimedBy != null &&
    Number.isFinite(Date.parse(String(row.reviewed_at ?? ""))) &&
    Date.now() - Date.parse(String(row.reviewed_at)) > FEED_AD_REVIEW_CLAIM_STALE_MS;
  if (claimedBy && !claimStale) {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }
  /**
   * R-25: 멈춘 승인이 포인트 확정(capture)까지 갔으면 회원 취소로 풀 수 없다(해제는 보류분만 돌려줌 → 「취소됨 + 차감 확정」).
   * 보류가 아닌 포인트(확정)가 있으면 취소를 받지 않는다 — 어드민 처리 대상. 조회 실패 = 받지 않음.
   */
  if (claimedBy) {
    const { data: settled, error: holdErr } = await sb
      .from("feed_ad_point_holds")
      .select("id")
      .eq("request_id", requestId)
      .neq("status", "held")
      .neq("status", "released")
      .limit(1);
    if (holdErr) return { ok: false, error: "cancel_check_failed", httpStatus: 503 };
    if ((settled ?? []).length > 0) return { ok: false, error: "not_pending", httpStatus: 409 };
  }

  /**
   * R-04: 상태 변경을 **먼저** 한다(조건: 아직 검토 중 · 위에서 본 검토자 그대로). 성공했을 때만 보류를 푼다 —
   * 예전 순서(보류 해제 → 상태 변경)는 그 사이 승인이 끼면 「보류 없는 검토 중」 신청이 남았다.
   * 상태가 「취소됨」이 되면 승인 쪽 claim(조건: 검토 중 · 검토자 없음)은 더 이상 잡히지 않는다.
   */
  const now = new Date().toISOString();
  let cancelQ = sb
    .from("feed_ad_requests")
    .update({
      status: "cancelled",
      review_reason: "member_cancelled",
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", requestId)
    .eq("status", "pending_review")
    .eq("user_id", params.userId);
  cancelQ = claimedBy ? cancelQ.eq("reviewed_by", claimedBy) : cancelQ.is("reviewed_by", null);
  const { data: cancelled, error: upd } = await cancelQ.select("id").maybeSingle();

  if (upd) {
    return { ok: false, error: upd.message, httpStatus: 500 };
  }
  if (!cancelled?.id) {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }

  const released = await releaseHeldPointsForFeedAdRequest(sb, { requestId });
  if (!released.ok) {
    /**
     * 보류를 못 풀었으면 취소를 되돌린다(포인트는 묶인 채 「취소됨」이 되지 않게).
     * R-24: 되돌리기 결과도 확인한다 — 실패하면 「취소됨 + 보류 남음」이므로 운영 확인용 기록을 남긴다.
     * 근본(상태 변경·보류 해제 한 트랜잭션)은 DB 함수 `member_cancel_feed_ad_request` — 운영 DB 적용 승인 뒤(B-DB 묶음).
     */
    const { data: reverted, error: revertErr } = await sb
      .from("feed_ad_requests")
      .update({ status: "pending_review", review_reason: null, reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "cancelled")
      .select("id")
      .maybeSingle();
    if (revertErr || !reverted?.id) {
      console.error("[cancelFeedAdRequest] cancel_revert_failed — cancelled with held points", {
        requestId,
        releaseError: released.error,
        revertError: revertErr?.message ?? "no_row",
      });
    }
    return { ok: false, error: released.error, httpStatus: 500 };
  }

  return { ok: true, status: "cancelled" };
}
