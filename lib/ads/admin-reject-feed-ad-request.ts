import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

/**
 * 피드 광고 신청 거절 — 단일 구현 (H-2).
 * 도메인 화면(`PATCH /api/admin/feed-ad-requests/[id]`)과 광고 허브(`POST /api/admin/advertising-workspace/action`)가
 * 같은 함수를 부른다: DB 함수 `admin_reject_feed_ad_request` 한 트랜잭션(행 잠금·보류 포인트 환급·상태 rejected)
 * + 같은 감사 기록(`feed_ad_request.reject`, before/after).
 */
export type AdminRejectFeedAdRequestResult =
  | { ok: true; status: "rejected"; previousStatus: string; releasedPoints: number }
  | { ok: false; error: string; httpStatus: number };

export function mapAdminRejectFeedAdRequestErrorStatus(error: string): number {
  if (error === "not_found") return 404;
  if (error === "not_pending") return 409;
  if (error === "reason_required" || error === "invalid_args") return 400;
  return 500;
}

export async function adminRejectFeedAdRequest(
  sb: SupabaseClient,
  req: Request,
  input: { requestId: string; reason: string; actorId: string }
): Promise<AdminRejectFeedAdRequestResult> {
  const reason = String(input.reason ?? "").trim().slice(0, 500);
  if (!reason) return { ok: false, error: "reason_required", httpStatus: 400 };

  const { data: rpcData, error: rpcErr } = await sb.rpc("admin_reject_feed_ad_request", {
    p_request_id: input.requestId,
    p_reason: reason,
    p_actor: input.actorId,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message, httpStatus: 500 };

  const out = (rpcData ?? {}) as {
    ok?: boolean;
    error?: string;
    previous_status?: string;
    released_points?: number;
  };
  if (!out.ok) {
    const error = String(out.error ?? "reject_failed");
    return { ok: false, error, httpStatus: mapAdminRejectFeedAdRequestErrorStatus(error) };
  }

  const previousStatus = out.previous_status ?? "pending_review";
  const releasedPoints = Number(out.released_points ?? 0);
  await appendAdminRouteAudit(sb, req, {
    actorId: input.actorId,
    targetType: "feed_ad_request",
    targetId: input.requestId,
    action: "feed_ad_request.reject",
    before: { status: previousStatus },
    after: { status: "rejected", reason, released_points: releasedPoints },
  });
  return { ok: true, status: "rejected", previousStatus, releasedPoints };
}
