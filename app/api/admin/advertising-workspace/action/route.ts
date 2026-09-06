import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { persistAdvertisingAdminMemo } from "@/lib/ads/advertising-admin-memo";
import {
  approveCommunityPaidExposure,
  rejectCommunityPaidExposure,
} from "@/lib/promotion/apply-community-paid-exposure";
import {
  approveTradePaidExposure,
  rejectTradePaidExposure,
} from "@/lib/promotion/apply-trade-paid-exposure";
import { applyBoostLifecycle } from "@/lib/promotion/admin-boost-lifecycle";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  adminTransitionDeliveryAdCampaign,
  adminDeleteSafeDraftDeliveryAdCampaign,
} from "@/lib/stores/advertising/admin-delivery-ad-writer";
import {
  isAdminDeliveryAdAction,
  isAdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { adminActOnPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-approve";
import { isPlatformPopupOwnerRequestAdminAction } from "@/lib/platform-popup/owner-request-types";
import { transitionPlatformPopupCampaign } from "@/lib/platform-popup/admin-transitions";
import type { PlatformPopupCampaignStatus } from "@/lib/platform-popup/types";
import type { WorkspaceDrawerAction, WorkspaceEntityFamily } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

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
    productKind?: string;
    expectedLifecycle?: string;
    expectedUpdatedAt?: string;
    popupTransition?: string;
  };

  const family = body.family;
  const entityId = (body.entityId ?? "").trim();
  const action = body.action;
  if (!family || !entityId || !action) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

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
      targetType: `advertising:${family}`,
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

  if (family === "boost_community" || family === "boost_trade") {
    const domain = family === "boost_community" ? "community" : "trade";
    if (action === "approve") {
      const res =
        domain === "community"
          ? await approveCommunityPaidExposure(sb, {
              orderId: entityId,
              adminUserId: admin.userId,
            })
          : await approveTradePaidExposure(sb, {
              orderId: entityId,
              adminUserId: admin.userId,
            });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      void appendAuditLog(sb, {
        actor_type: "admin",
        actor_id: admin.userId,
        target_type: `${domain}_promotion_order`,
        target_id: entityId,
        action: `${domain}_promotion_order.approve`,
        before_json: null,
        after_json: { action, endAt: res.endAt },
        ip: meta.ip,
        user_agent: meta.userAgent,
      });
      return NextResponse.json({ ok: true, endAt: res.endAt });
    }
    if (action === "reject") {
      if (!publicMsg) {
        return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
      }
      const res =
        domain === "community"
          ? await rejectCommunityPaidExposure(sb, { orderId: entityId, reason: publicMsg })
          : await rejectTradePaidExposure(sb, { orderId: entityId, reason: publicMsg });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      await persistAdvertisingAdminMemo(sb, {
        adminId: admin.userId,
        adId: entityId,
        targetType: `${domain}_promotion_order`,
        kind: "public",
        memo: publicMsg,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "pause" || action === "resume" || action === "end") {
      const res = await applyBoostLifecycle(sb, {
        orderId: entityId,
        domain,
        action,
        adminUserId: admin.userId,
        reason: publicMsg || null,
      });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
      }
      void appendAuditLog(sb, {
        actor_type: "admin",
        actor_id: admin.userId,
        target_type: `${domain}_promotion_order`,
        target_id: entityId,
        action: `${domain}_promotion_order.${action}`,
        before_json: null,
        after_json: {
          order_status: res.orderStatus,
          endAt: res.endAt,
          refundPolicy: action === "end" ? "ADMIN_END_REFUND_POLICY_REQUIRED" : null,
        },
        ip: meta.ip,
        user_agent: meta.userAgent,
      });
      return NextResponse.json({ ok: true, orderStatus: res.orderStatus, endAt: res.endAt });
    }
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }

  if (family === "feed_banner") {
    const feedAction =
      action === "approve"
        ? "approve"
        : action === "reject"
          ? "reject"
          : action === "pause"
            ? "pause"
            : action === "resume"
              ? "resume"
              : action === "end"
                ? "end"
                : null;
    if (!feedAction) {
      return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
    }
    // Delegate to existing feed PATCH handler logic via relative import of writers is preferred;
    // call the same route module path by reusing service writers when available.
    const { pauseFeedAdCampaign, resumeFeedAdCampaign } = await import(
      "@/lib/ads/pause-resume-feed-ad-campaign"
    );
    const { endFeedAdCampaign } = await import("@/lib/ads/end-feed-ad-campaign");
    const { approveFeedAdRequest } = await import("@/lib/ads/approve-feed-ad-request");

    if (feedAction === "approve") {
      const res = await approveFeedAdRequest(sb, {
        requestId: entityId,
        adminUserId: admin.userId,
      });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      return NextResponse.json(res);
    }
    if (feedAction === "reject") {
      if (!publicMsg) {
        return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
      }
      const { releaseHeldPointsForFeedAdRequest } = await import(
        "@/lib/ads/feed-ad-request-point-flow"
      );
      const released = await releaseHeldPointsForFeedAdRequest(sb, { requestId: entityId });
      if (!released.ok) {
        return NextResponse.json({ ok: false, error: released.error }, { status: 400 });
      }
      const { data: rejected, error: upd } = await sb
        .from("feed_ad_requests")
        .update({
          status: "rejected",
          review_reason: publicMsg.slice(0, 500),
        })
        .eq("id", entityId)
        .in("status", ["pending_review", "held"])
        .select("id")
        .maybeSingle();
      if (upd || !rejected?.id) {
        return NextResponse.json({ ok: false, error: upd?.message ?? "reject_failed" }, { status: 400 });
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
      return NextResponse.json({ ok: true, status: "rejected" });
    }
    if (feedAction === "pause") {
      const result = await pauseFeedAdCampaign(sb, {
        requestId: entityId,
        adminUserId: admin.userId,
        reason: publicMsg || "admin_paused",
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
      }
      return NextResponse.json(result);
    }
    if (feedAction === "resume") {
      const result = await resumeFeedAdCampaign(sb, {
        requestId: entityId,
        adminUserId: admin.userId,
        reason: publicMsg || "admin_resumed",
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
      }
      return NextResponse.json(result);
    }
    const endRes = await endFeedAdCampaign(sb, {
      requestId: entityId,
      adminUserId: admin.userId,
      reason: publicMsg || "admin_ended",
    });
    if (!endRes.ok) {
      return NextResponse.json({ ok: false, error: endRes.error }, { status: endRes.httpStatus });
    }
    return NextResponse.json(endRes);
  }

  if (family === "delivery_banner" || family === "delivery_sponsored") {
    const productKind = family === "delivery_sponsored" ? "store_sponsored" : "banner";
    if (!isAdminDeliveryAdProduct(productKind)) {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    const table =
      productKind === "banner" ? STORE_BANNER_AD_CAMPAIGN_TABLE : STORE_PAID_AD_CAMPAIGN_TABLE;
    const { data: camp, error: campErr } = await sb
      .from(table)
      .select("id, lifecycle_status, updated_at")
      .eq("id", entityId)
      .maybeSingle();
    if (campErr || !camp?.id) {
      return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    }
    const expectedLifecycle = String(
      body.expectedLifecycle ?? (camp as { lifecycle_status?: string }).lifecycle_status ?? ""
    ) as DeliveryAdLifecycleStatus;
    const expectedUpdatedAt = String(
      body.expectedUpdatedAt ?? (camp as { updated_at?: string }).updated_at ?? ""
    );

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
      const { count } = await sb
        .from(DELIVERY_AD_AUDIT_LOG_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("product_kind", productKind)
        .eq("campaign_id", entityId);
      const result = await adminDeleteSafeDraftDeliveryAdCampaign(sb, {
        adminUserId: admin.userId,
        productKind,
        campaignId: entityId,
        expectedLifecycle,
        expectedUpdatedAt,
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: (count ?? 0) > 0,
        },
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, result });
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
      return NextResponse.json(
        { ok: false, error: result.error, detail: result.detail },
        { status: 400 }
      );
    }
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
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus ?? 400 });
    }
    return NextResponse.json(res);
  }

  return NextResponse.json({ ok: false, error: "unsupported_family" }, { status: 400 });
}
