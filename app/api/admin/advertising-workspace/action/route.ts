import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { persistAdvertisingAdminMemo } from "@/lib/ads/advertising-admin-memo";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { runCommunityPromotionOrderAction } from "@/lib/admin/community-admin/community-promotion-order-action";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  runTradePromotionAction,
  TRADE_PROMOTION_ACTIONS,
  type TradePromotionAction,
} from "@/lib/admin/trade-admin/trade-promotion-admin";
import {
  ADMIN_REASON_REQUIRED_CODE,
  parseAdminInternalReason,
  parseAdminPublicReason,
  parseAdminReason,
} from "@/lib/admin/operator-ux/admin-reason";
import { adminTransitionDeliveryAdCampaign } from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { adminDeleteDeliveryAdDraftGuarded } from "@/lib/stores/advertising/admin-delivery-ad-delete";
import {
  adminEndDeliveryAdWithRefund,
  isDeliveryAdEndFault,
  isDeliveryAdLiveEndLifecycle,
} from "@/lib/stores/advertising/admin-delivery-ad-end";
import { clientSafeErrorDetail } from "@/lib/security/internal-error-response";
import { runFeedAdAdminAction } from "@/lib/admin/advertising-workspace/feed-ad-admin-actions";
import { adsClientSafeErrorCode } from "@/lib/admin/advertising-workspace/ads-admin-action-audit";
import { ADS_WORKSPACE_REASON_REQUIRED_ACTIONS } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import {
  isAdminDeliveryAdAction,
  isAdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { adminActOnPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-approve";
import { isPlatformPopupOwnerRequestAdminAction } from "@/lib/platform-popup/owner-request-types";
import { transitionPlatformPopupCampaign } from "@/lib/platform-popup/admin-transitions";
import type { PlatformPopupCampaignStatus } from "@/lib/platform-popup/types";
import type { WorkspaceDrawerAction, WorkspaceEntityFamily } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import {
  advertisingWorkspaceMemoTargetType,
  requireAdvertisingWorkspaceFamilyGate,
} from "@/lib/admin/advertising-workspace/workspace-memo-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/advertising-workspace/action
 * Drawer → existing domain writers (no new campaign engine).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    family?: WorkspaceEntityFamily;
    entityId?: string;
    action?: WorkspaceDrawerAction;
    reason?: string;
    publicMessage?: string;
    internalMemo?: string;
    /** D-6: 조치 확인창의 내부 메모(운영자만) — `reason` 은 공개 사유(회원·사장님에게 보임 · 120자) */
    internalReason?: string;
    productKind?: string;
    expectedLifecycle?: string;
    expectedUpdatedAt?: string;
    popupTransition?: string;
    startAt?: string;
    endAt?: string;
    /** 종료 귀책 (설계 §6 · D-5 · D-13) — 상위노출·피드·배달 공통: 'operator' 비례 환급 / 'member'·'none' 환급 없음 */
    fault?: "operator" | "member" | "none";
    reasonCode?: string;
    preview?: boolean;
    /** Compensation / paid extend days — required for extend_compensation */
    requestedDays?: number;
    extensionKind?: "PAID" | "ADMIN_FREE_COMPENSATION";
  };

  const family = body.family;
  const entityId = (body.entityId ?? "").trim();
  const action = body.action;
  if (!family || !entityId || !action) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  // G-01 (P0) · IA-04 (K-2): 같은 업무 = 같은 키. 계열별 서버 가드를 모든 조치(내부 메모 포함) 앞에서 강제한다.
  // - 배달 광고(배너·스폰서) = business — `/api/admin/delivery-ads/[campaignId]/actions`·`extend` 와 같은 키.
  //   보상 연장(extend_compensation)은 매장 캐시 차감 경로가 있어 business 가 필수. ads 를 겹쳐 요구하지 않는다(이중 게이트 금지).
  // - 사장님 팝업 신청 승인·반려 = business — `/api/admin/platform-popup-requests/[requestId]/actions` 와 같은 키.
  // - 피드 배너·플랫폼 팝업 캠페인 = ads — `/api/admin/feed-ads*`·`/api/admin/platform-popup-campaigns*` 쓰기와 같은 키.
  // - 거래 홍보 = requireTradeAdmin (O-2) · 커뮤니티 홍보 = requireCommunityAdmin("promotion") — 아래 계열 분기 안에서 강제.
  //   내부 메모는 계열 분기 전에 끝나므로 여기서 같은 도메인 가드를 건다.
  const familyGate = await requireAdvertisingWorkspaceFamilyGate(family, {
    internalMemo: action === "add_internal_memo",
  });
  if (familyGate && !familyGate.ok) return familyGate.response;

  const meta = getAuditRequestMeta(req);
  const publicMsg = (body.publicMessage ?? body.reason ?? "").trim();
  const internalMemo = (body.internalMemo ?? "").trim();

  if (action === "add_internal_memo") {
    if (!internalMemo) {
      return NextResponse.json({ ok: false, error: "empty_memo" }, { status: 400 });
    }
    const res = await persistAdvertisingAdminMemo(sb, {
      adminId: admin.userId,
      adId: entityId,
      targetType: advertisingWorkspaceMemoTargetType(family),
      kind: "internal",
      memo: internalMemo,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, memo: "internal" });
  }

  // 설계 §6 · FB-A05 · AD-103 · AL-04~06 (2026-11-04) — 동작 단계 표(`admin-action-levels.ts`)와 같은 서버 규칙:
  // 승인·반려·보류·정지·재개·연장(L2)·종료·삭제(L3)는 모든 광고 계열에서 처리 사유 필수 (종료 환급 미리보기만 예외).
  // 사유는 각 도메인 writer·감사 기록으로 그대로 전달된다. 빈 사유를 코드값("admin_paused" 등)으로 바꿔 저장하지 않는다.
  const reasonRequiredActions: readonly string[] = ADS_WORKSPACE_REASON_REQUIRED_ACTIONS;
  const adminReason = parseAdminReason(body.reason);
  if (body.preview !== true && reasonRequiredActions.includes(action) && !adminReason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
  const internalReason = parseAdminInternalReason(body.internalReason);
  /** D-6: 내부 메모를 받는 writer 가 없는 계열은 같은 조치의 내부 메모로 남긴다 (회원 응답에는 나가지 않음). */
  const persistInternalReason = async () => {
    if (!internalReason || body.preview === true) return;
    await persistAdvertisingAdminMemo(sb, {
      adminId: admin.userId,
      adId: entityId,
      targetType: advertisingWorkspaceMemoTargetType(family),
      kind: "internal",
      memo: `[${action}] ${internalReason}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  };

  if (family === "boost_trade") {
    // 거래 홍보는 거래 Admin 과 같은 처리 (설계 v2 §G-0): 조치 1건 = DB 함수 1번 (상태·포인트·환급·감사 한 트랜잭션).
    const gate = await requireTradeAdmin();
    if (!gate.ok) return gate.response;
    if (!(TRADE_PROMOTION_ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }
    const res = await runTradePromotionAction(gate.sb, {
      orderId: entityId,
      actorId: gate.userId,
      action: action as TradePromotionAction,
      reason: publicMsg || null,
      fault:
        body.fault === "operator" || body.fault === "member" || body.fault === "none" ? body.fault : null,
      reasonCode: body.reasonCode ?? null,
      preview: body.preview === true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
    await persistInternalReason();
    return NextResponse.json({ ok: true, ...res.data, ...(res.notifyWarning ? { sideEffectWarning: true } : {}) });
  }

  if (family === "boost_community") {
    // 커뮤니티 홍보는 커뮤니티 Admin 과 같은 권한·같은 규칙 (설계 v2 §E-1-2) · H-3: 같은 단일 구현.
    // 중지·재개·종료 모두 사유 필수(2자) · 감사 before(조치 전 주문 행)/after(조치 후 주문 행) · 종료 알림 —
    // `PATCH /api/admin/community-promotion-orders/[id]` 와 같은 `runCommunityPromotionOrderAction`.
    const gate = await requireCommunityAdmin("promotion");
    if (!gate.ok) return gate.response;
    const out = await runCommunityPromotionOrderAction(sb, req, {
      orderId: entityId,
      actorId: admin.userId,
      action,
      reason: publicMsg,
      fault: body.fault,
      reasonCode: body.reasonCode,
      preview: body.preview === true,
    });
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error }, { status: out.httpStatus });
    }
    await persistInternalReason();
    return NextResponse.json(out.body);
  }

  if (family === "feed_banner") {
    if (action === "reject") {
      if (!publicMsg) {
        return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
      }
      // H-2: 도메인 화면(`/admin/feed-ad-requests/[id]`)과 같은 단일 구현 —
      // DB 함수 한 트랜잭션(보류 포인트 환급 + 상태 rejected) + 같은 감사(feed_ad_request.reject).
      const { adminRejectFeedAdRequest } = await import("@/lib/ads/admin-reject-feed-ad-request");
      const rejected = await adminRejectFeedAdRequest(sb, req, {
        requestId: entityId,
        reason: publicMsg,
        actorId: admin.userId,
      });
      if (!rejected.ok) {
        return NextResponse.json({ ok: false, error: rejected.error }, { status: rejected.httpStatus });
      }
      await persistAdvertisingAdminMemo(sb, {
        adminId: admin.userId,
        adId: entityId,
        targetType: "feed_ad_request",
        kind: "public",
        memo: publicMsg,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await persistInternalReason();
      return NextResponse.json({ ok: true, status: "rejected" });
    }
    const feedAction =
      action === "approve"
        ? "approve"
        : action === "pause"
          ? "pause"
          : action === "resume"
            ? "resume"
            : action === "end" || action === "terminate"
              ? "end"
              : action === "extend_compensation"
                ? "extend_compensation"
                : null;
    if (!feedAction) {
      return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
    }
    /**
     * 설계 §6 · FB-A05/A06/A07 · AL-09 · AL-10 · D-5 · D-6: 도메인 화면과 같은 단일 구현.
     * 회원 신청 id · 운영자 등록 캠페인 id 둘 다 받는다(신청이 없으면 캠페인으로 보고 감사 대상 = feed_ad_campaign).
     */
    const out = await runFeedAdAdminAction(sb, req, {
      entityId,
      action: feedAction,
      adminUserId: admin.userId,
      publicReason: parseAdminPublicReason(body.reason),
      internalReason,
      fault: body.fault === "operator" || body.fault === "member" || body.fault === "none" ? body.fault : null,
      preview: body.preview === true,
      requestedDays: Number(body.requestedDays ?? 1),
      screen: "hub",
    });
    return NextResponse.json(out.body, { status: out.httpStatus });
  }

  if (family === "delivery_banner" || family === "delivery_sponsored") {
    const productKind = family === "delivery_sponsored" ? "store_sponsored" : "banner";
    if (!isAdminDeliveryAdProduct(productKind)) {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    // DEF-6: 화면에서 본 버전(updated_at·lifecycle)을 반드시 받는다 — DB 현재값으로 대신 채우면 동시성 검사가 꺼진다.
    const expectedLifecycle = (
      typeof body.expectedLifecycle === "string" ? body.expectedLifecycle.trim() : ""
    ) as DeliveryAdLifecycleStatus;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!expectedLifecycle || !expectedUpdatedAt) {
      return NextResponse.json({ ok: false, error: "expected_version_required" }, { status: 400 });
    }
    const table =
      productKind === "banner" ? STORE_BANNER_AD_CAMPAIGN_TABLE : STORE_PAID_AD_CAMPAIGN_TABLE;
    const { data: camp, error: campErr } = await sb
      .from(table)
      .select("id")
      .eq("id", entityId)
      .maybeSingle();
    if (campErr || !camp?.id) {
      return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    }

    if (action === "extend_compensation") {
      if (!publicMsg) {
        return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
      }
      const days = Number(body.requestedDays ?? 1);
      const extensionKind =
        body.extensionKind === "PAID" ? "PAID" : "ADMIN_FREE_COMPENSATION";
      const { adminExtendDeliveryAdCampaign } = await import(
        "@/lib/stores/advertising/admin-delivery-ad-extension-writer"
      );
      const ext = await adminExtendDeliveryAdCampaign(sb, {
        adminUserId: admin.userId,
        productKind,
        campaignId: entityId,
        expectedUpdatedAt,
        requestedDays: Number.isInteger(days) ? days : 0,
        extensionKind,
        reason: publicMsg,
      });
      if (!ext.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: adsClientSafeErrorCode(ext.error, "save_failed", "[ads-workspace delivery extend]"),
            // AL-19: 원문 오류는 서버 로그로만 — 고정 코드의 업무 안내(4xx)만 화면에 보낸다.
            detail:
              adsClientSafeErrorCode(ext.error, "", "[ads-workspace delivery extend]") === ext.error
                ? clientSafeErrorDetail(ext.error, ext.detail, ext.httpStatus, "[ads-workspace delivery extend]") ?? null
                : null,
          },
          { status: ext.httpStatus }
        );
      }
      await persistInternalReason();
      return NextResponse.json({
        ok: true,
        extension: {
          old_end: ext.previousEndAt,
          new_end: ext.newEndAt,
          extension_duration_days: ext.daysAdded,
          charge_policy: ext.extensionKind,
          reason: publicMsg,
          admin_id: admin.userId,
          amountMinor: ext.amountMinor,
          paymentStatus: ext.paymentStatus,
        },
      });
    }

    const deliveryAction =
      action === "approve"
        ? "approve"
        : action === "reject"
          ? "reject"
          : action === "request_changes"
            ? "request_changes"
            : action === "pause"
              ? "pause"
              : action === "resume"
                ? "resume"
                : action === "end"
                  ? "end"
                  : action === "terminate"
                    ? "terminate"
                    : action === "delete_safe_draft"
                      ? "delete_safe_draft"
                      : null;
    if (!deliveryAction || !isAdminDeliveryAdAction(deliveryAction)) {
      return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
    }

    if (deliveryAction === "delete_safe_draft") {
      // AL-01 · §4-3: 배달 도메인 상세와 같은 삭제 함수 — 노출·결제·문의·막는 감사 이력은 서버가 센다.
      const del = await adminDeleteDeliveryAdDraftGuarded(sb, {
        adminUserId: admin.userId,
        productKind,
        campaignId: entityId,
        expectedLifecycle,
        expectedUpdatedAt,
        reason: adminReason,
      });
      if (!del.ok) {
        return NextResponse.json(
          { ok: false, error: adsClientSafeErrorCode(del.error, "save_failed", "[ads-workspace delivery delete]") },
          { status: del.httpStatus }
        );
      }
      return NextResponse.json({ ok: true, result: { campaignId: del.campaignId, action: "delete_safe_draft" } });
    }

    if (deliveryAction === "end" && isDeliveryAdLiveEndLifecycle(expectedLifecycle)) {
      // AL-04 · D-13: 진행 중 종료 = 귀책 + 남은 기간 비례 환급 (도메인 상세와 같은 함수 · 미리보기 먼저).
      if (!isDeliveryAdEndFault(body.fault)) {
        return NextResponse.json({ ok: false, error: "fault_required" }, { status: 400 });
      }
      const { data: cur } = await sb
        .from(table)
        .select("id, lifecycle_status, updated_at")
        .eq("id", entityId)
        .maybeSingle();
      const curRow = (cur ?? {}) as { lifecycle_status?: string; updated_at?: string };
      if (String(curRow.lifecycle_status ?? "") !== expectedLifecycle) {
        return NextResponse.json({ ok: false, error: "stale_lifecycle" }, { status: 409 });
      }
      if (String(curRow.updated_at ?? "") !== expectedUpdatedAt) {
        return NextResponse.json({ ok: false, error: "stale_updated_at" }, { status: 409 });
      }
      const ended = await adminEndDeliveryAdWithRefund(sb, {
        campaignId: entityId,
        adminUserId: admin.userId,
        fault: body.fault,
        reason: adminReason ?? "",
        preview: body.preview === true,
      });
      if (!ended.ok) {
        return NextResponse.json(
          { ok: false, error: adsClientSafeErrorCode(ended.error, "save_failed", "[ads-workspace delivery end]") },
          { status: ended.httpStatus }
        );
      }
      if (!ended.preview) await persistInternalReason();
      return NextResponse.json({
        ok: true,
        preview: ended.preview ? { refundAmount: ended.refundAmount, paidAmount: ended.paidAmount } : null,
        refundAmount: ended.refundAmount,
        paidAmount: ended.paidAmount,
        remainingSeconds: ended.remainingSeconds,
        result: { campaignId: entityId, action: "end" },
      });
    }
    if (body.preview === true) {
      return NextResponse.json({ ok: false, error: "preview_not_supported" }, { status: 400 });
    }

    const result = await adminTransitionDeliveryAdCampaign(sb, {
      adminUserId: admin.userId,
      productKind,
      campaignId: entityId,
      action: deliveryAction,
      expectedLifecycle,
      expectedUpdatedAt,
      reason: publicMsg || null,
      ownerVisibleNotes: publicMsg || null,
    });
    if (!result.ok) {
      // AL-19: 배달 writer 원문(`detail` · DB error.message)을 그대로 내보내지 않는다.
      const safeCode = adsClientSafeErrorCode(result.error, "save_failed", "[ads-workspace delivery]");
      return NextResponse.json(
        {
          ok: false,
          error: safeCode,
          // 원래 코드가 고정 코드일 때만 업무 안내(detail)를 싣는다 — 원문 오류면 detail 도 버린다
          detail:
            safeCode === result.error
              ? clientSafeErrorDetail(result.error, result.detail, 400, "[ads-workspace delivery]") ?? null
              : null,
        },
        { status: 400 }
      );
    }
    await persistInternalReason();
    if (publicMsg && (action === "reject" || action === "request_changes")) {
      await persistAdvertisingAdminMemo(sb, {
        adminId: admin.userId,
        adId: entityId,
        targetType: `delivery_ad_${productKind}`,
        kind: "public",
        memo: publicMsg,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return NextResponse.json({ ok: true, result });
  }

  if (family === "platform_popup_request") {
    const popupAction =
      action === "approve" ? "approve" : action === "reject" ? "reject" : null;
    if (!popupAction || !isPlatformPopupOwnerRequestAdminAction(popupAction)) {
      return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
    }
    const res = await adminActOnPlatformPopupOwnerRequest(sb, {
      requestId: entityId,
      adminUserId: admin.userId,
      action: popupAction,
      reason: publicMsg || null,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus ?? 400 });
    }
    return NextResponse.json(res);
  }

  if (family === "platform_popup_campaign") {
    if (action === "delete_safe_draft") {
      const { adminDeletePlatformPopupDraftCampaign } = await import(
        "@/lib/platform-popup/admin-campaign-delete-draft"
      );
      const del = await adminDeletePlatformPopupDraftCampaign(sb, {
        campaignId: entityId,
        adminUserId: admin.userId,
        reason: adminReason,
      });
      if (!del.ok) {
        return NextResponse.json(
          { ok: false, error: del.error },
          { status: del.httpStatus ?? 400 }
        );
      }
      return NextResponse.json({ ok: true, id: del.id });
    }

    if (action === "change_period") {
      const startAt = typeof body.startAt === "string" ? body.startAt.trim() : "";
      const endAt = typeof body.endAt === "string" ? body.endAt.trim() : "";
      if (!startAt || !endAt) {
        return NextResponse.json({ ok: false, error: "period_required" }, { status: 400 });
      }
      const { updatePlatformPopupAdminCampaign } = await import(
        "@/lib/platform-popup/admin-campaign-writer"
      );
      // AL-07 · E-2 (Owner 권장안 승인): 운영자 팝업(사장님 신청 연결 없음)은 기간만 바꿀 때 재검토로 되돌리지 않는다 →
      // 「바뀐 소재」 목록에 기간을 넣지 않는다. 사장님 신청 연결 팝업은 지금 규칙(기간 = 재검토) 그대로.
      const { data: popupRow } = await sb
        .from("platform_popup_campaigns")
        .select("id, owner_request_id")
        .eq("id", entityId)
        .maybeSingle();
      const operatorPopup = !(popupRow as { owner_request_id?: string | null } | null)?.owner_request_id;
      const res = await updatePlatformPopupAdminCampaign(sb, {
        campaignId: entityId,
        adminUserId: admin.userId,
        patch: { startAt, endAt },
        materialTouched: operatorPopup ? [] : ["schedule"],
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: adsClientSafeErrorCode(res.error, "save_failed", "[ads-workspace popup period]") },
          { status: res.httpStatus ?? 400 }
        );
      }
      // 재검토로 돌아갔으면 화면 결과 문구에 「다시 승인 필요」를 보인다.
      return NextResponse.json({ ok: true, id: entityId, revertedToReview: res.revertedToReview === true });
    }

    const nextStatus = (body.popupTransition ??
      (action === "pause"
        ? "paused"
        : action === "resume"
          ? "active"
          : action === "end"
            ? "ended"
            : null)) as PlatformPopupCampaignStatus | null;
    if (!nextStatus) {
      return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
    }
    const res = await transitionPlatformPopupCampaign(sb, {
      campaignId: entityId,
      actorUserId: admin.userId,
      actorRole: "admin",
      nextStatus,
      reason: adminReason ?? (publicMsg || null),
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: adsClientSafeErrorCode(res.error, "save_failed", "[ads-workspace popup]") },
        { status: res.httpStatus ?? 400 }
      );
    }
    await persistInternalReason();
    return NextResponse.json(res);
  }

  return NextResponse.json({ ok: false, error: "unsupported_family" }, { status: 400 });
}
