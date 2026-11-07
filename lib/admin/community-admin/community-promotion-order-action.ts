/**
 * 커뮤니티 상위노출 주문 관리자 조치 — 단일 구현 (H-3).
 * 도메인 화면(`PATCH /api/admin/community-promotion-orders/[id]`)과 광고 허브
 * (`POST /api/admin/advertising-workspace/action` family=boost_community)가 같은 함수를 부른다:
 * 같은 사유 규칙(중지·재개·종료 모두 사유 필수, 2자 이상) · 같은 DB 함수(applyBoostLifecycle) ·
 * 같은 감사(before = 조치 전 주문 행, after = 조치 후 주문 행) · 같은 종료 알림.
 * 서버 전용.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { parseCommunityPromotionFault } from "@/lib/admin/community-admin/community-promotion-admin";
import { notifyCommunityPromotionEnded } from "@/lib/notifications/notify-community-moderation";
import { applyBoostLifecycle } from "@/lib/promotion/admin-boost-lifecycle";
import { parseAdminInternalReason } from "@/lib/admin/operator-ux/admin-reason";
import { persistAdvertisingAdminMemo } from "@/lib/ads/advertising-admin-memo";
import { advertisingWorkspaceMemoTargetType } from "@/lib/admin/advertising-workspace/workspace-memo-gate";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";

export const COMMUNITY_PROMOTION_ORDER_AUDIT_SELECT =
  "id, domain, user_id, target_id, order_status, point_cost, duration_days, start_at, end_at, review_reason, " +
  "paused_at, paused_seconds_total, ended_by, ended_at, end_reason_code, fault, refund_points, refund_ledger_id";

export type CommunityPromotionOrderActionInput = {
  orderId: string;
  actorId: string;
  action: string;
  reason?: unknown;
  fault?: unknown;
  reasonCode?: unknown;
  preview?: boolean;
  /**
   * D-10 (2026-11-07) — 도메인 화면의 내부 메모(운영자만). 공개 사유(`reason`)와 달리 회원 알림·응답에 나가지 않고
   * 같은 조치의 운영자 메모(감사)로만 남긴다. 공통 광고 화면은 자기 경로에서 따로 남기므로 넘기지 않는다.
   */
  internalReason?: unknown;
};

export type CommunityPromotionOrderActionResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string; httpStatus: number };

export async function runCommunityPromotionOrderAction(
  sb: SupabaseClient,
  req: Request | null,
  input: CommunityPromotionOrderActionInput
): Promise<CommunityPromotionOrderActionResult> {
  const orderId = input.orderId.trim();
  if (!orderId) return { ok: false, error: "id_required", httpStatus: 400 };
  const action = input.action.trim();

  if (action === "approve" || action === "reject") {
    // C-47: 이전 「신청→승인」 보류 경로 — 판매 상품 없음, 비활성.
    return { ok: false, error: "legacy_flow_disabled", httpStatus: 410 };
  }
  if (action !== "pause" && action !== "resume" && action !== "end") {
    return { ok: false, error: "invalid_action", httpStatus: 400 };
  }

  const preview = action === "end" && input.preview === true;
  // 환급 미리보기는 아무것도 바꾸지 않으므로 사유 없이 계산만 한다 (RPC 사유 검사용 고정 문구).
  const reason = normalizeCommunityAdminReason(input.reason) ?? (preview ? "환급 미리보기" : null);
  if (!reason) return { ok: false, error: "reason_required", httpStatus: 400 };
  const fault = parseCommunityPromotionFault(input.fault);
  if (action === "end" && !fault) return { ok: false, error: "fault_required", httpStatus: 400 };

  const { data: before } = await sb
    .from("point_promotion_orders")
    .select(COMMUNITY_PROMOTION_ORDER_AUDIT_SELECT)
    .eq("id", orderId)
    .eq("domain", "community")
    .maybeSingle();
  if (!before) return { ok: false, error: "not_found", httpStatus: 404 };

  const res = await applyBoostLifecycle(sb, {
    orderId,
    domain: "community",
    action,
    adminUserId: input.actorId,
    reason,
    fault,
    reasonCode: typeof input.reasonCode === "string" ? input.reasonCode.trim().slice(0, 64) : null,
    preview,
  });
  if (!res.ok) return { ok: false, error: res.error, httpStatus: res.httpStatus };

  if (res.preview) {
    return { ok: true, body: { ok: true, preview: true, ...res.preview } };
  }

  const { data: after } = await sb
    .from("point_promotion_orders")
    .select(COMMUNITY_PROMOTION_ORDER_AUDIT_SELECT)
    .eq("id", orderId)
    .maybeSingle();

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: input.actorId,
    targetType: "community_promotion_order",
    targetId: orderId,
    action: `community_promotion_order.${action}`,
    reason,
    before: before as unknown as Record<string, unknown>,
    after: {
      ...((after ?? {}) as unknown as Record<string, unknown>),
      action,
      ...(action === "end" ? { fault, refund_points: res.refundPoints ?? 0 } : {}),
      ...(action === "resume" ? { extended_seconds: res.extendedSeconds ?? 0 } : {}),
    },
  });

  const internalReason = parseAdminInternalReason(input.internalReason);
  if (internalReason) {
    const meta = req ? getAuditRequestMeta(req) : { ip: null, userAgent: null };
    await persistAdvertisingAdminMemo(sb, {
      adminId: input.actorId,
      adId: orderId,
      targetType: advertisingWorkspaceMemoTargetType("boost_community"),
      kind: "internal",
      memo: `[${action}] ${internalReason}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  if (action === "end") {
    try {
      await notifyCommunityPromotionEnded(sb, {
        userId: res.buyerUserId ?? String((before as unknown as { user_id?: string }).user_id ?? ""),
        orderId,
        refundPoints: res.refundPoints ?? 0,
        reason,
      });
    } catch (e) {
      console.error("[community-promotion-order-action] end notify", e);
    }
  }

  return {
    ok: true,
    body: {
      ok: true,
      orderStatus: res.orderStatus,
      endAt: (after as { end_at?: string } | null)?.end_at ?? res.endAt,
      ...(action === "resume" ? { extendedSeconds: res.extendedSeconds ?? 0 } : {}),
      ...(action === "end"
        ? { refundPoints: res.refundPoints ?? 0, refundLedgerId: res.refundLedgerId ?? null }
        : {}),
      auditOk: audit.ok,
    },
  };
}
