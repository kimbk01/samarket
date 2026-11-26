/**
 * Member cancel: pending_review → RELEASE (PHASE 1 writer) → cancelled.
 * Double-cancel: second CAS fails with not_pending (no duplicate credit).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseHeldPointsForFeedAdRequest } from "@/lib/ads/feed-ad-request-point-flow";

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
    .select("id, status, user_id, reviewed_by")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchErr || !reqRow) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }
  if (String((reqRow as { user_id?: string }).user_id) !== params.userId) {
    return { ok: false, error: "forbidden", httpStatus: 403 };
  }
  if (String((reqRow as { status?: string }).status) !== "pending_review") {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }
  /**
   * 광고 감사 FB-15 (2026-11-26): 어드민이 승인을 시작한 신청(`reviewed_by` 있음)은 회원 취소를 받지 않는다 —
   * 승인 확정과 취소가 겹쳐 보류를 먼저 풀어 버리면 승인 쪽 차감 확정이 실패하고 상태가 「검토 중」으로 되돌아갔다.
   */
  if ((reqRow as { reviewed_by?: string | null }).reviewed_by) {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }

  const released = await releaseHeldPointsForFeedAdRequest(sb, { requestId });
  if (!released.ok) {
    return { ok: false, error: released.error, httpStatus: 500 };
  }

  const now = new Date().toISOString();
  const { data: cancelled, error: upd } = await sb
    .from("feed_ad_requests")
    .update({
      status: "cancelled",
      review_reason: "member_cancelled",
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", requestId)
    .eq("status", "pending_review")
    .is("reviewed_by", null)
    .eq("user_id", params.userId)
    .select("id")
    .maybeSingle();

  if (upd) {
    return { ok: false, error: upd.message, httpStatus: 500 };
  }
  if (!cancelled?.id) {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }

  return { ok: true, status: "cancelled" };
}
