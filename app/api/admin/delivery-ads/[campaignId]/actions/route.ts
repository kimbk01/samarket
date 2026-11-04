import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  isAdminDeliveryAdAction,
  isAdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  adminRefundOrphanDeliveryAdFunding,
  adminTransitionDeliveryAdCampaign,
} from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { adminDeleteDeliveryAdDraftGuarded } from "@/lib/stores/advertising/admin-delivery-ad-delete";
import {
  adminEndDeliveryAdWithRefund,
  isDeliveryAdEndFault,
  isDeliveryAdLiveEndLifecycle,
} from "@/lib/stores/advertising/admin-delivery-ad-end";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { clientSafeErrorDetail } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  // ADS-08 — 승인·반려(=Cash 환불)·일시중지·종료는 금전·노출 결정이므로 business 권한키 필수 (쿠폰·상품권과 동일).
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isAdminDeliveryAdProduct(body.productKind)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }
  /**
   * F-09 — refund orphan SECURED funding on a DRAFT campaign (failed submit transition).
   * Route-only operator action (no UI). Business permission + reason required.
   */
  if (body.action === "refund_orphan_funding") {
    const refundReason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!refundReason) {
      return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    }
    const refund = await adminRefundOrphanDeliveryAdFunding(sb, {
      adminUserId: admin.userId,
      productKind: body.productKind,
      campaignId,
      reason: refundReason,
    });
    if (!refund.ok) {
      const status =
        refund.error === "not_orphan" || refund.error === "not_secured"
          ? 409
          : refund.error === "reason_required" || refund.error === "invalid_product"
            ? 400
            : refund.error === "forbidden" || refund.error === "not_admin"
              ? 403
              : refund.error === "not_found"
                ? 404
                : refund.error === "rpc_missing"
                  ? 503
                  : 500;
      return NextResponse.json(
        { ok: false, error: refund.error, detail: clientSafeErrorDetail(refund.error, refund.detail, status, "[admin delivery-ads refund]") ?? null },
        { status }
      );
    }
    return NextResponse.json({ ok: true, result: refund });
  }

  if (!isAdminDeliveryAdAction(body.action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const expectedLifecycle = String(body.expectedLifecycle ?? "") as DeliveryAdLifecycleStatus;
  const expectedUpdatedAt = String(body.expectedUpdatedAt ?? "");
  if (!expectedLifecycle || !expectedUpdatedAt) {
    return NextResponse.json({ ok: false, error: "stale_lifecycle" }, { status: 409 });
  }

  const reason = body.reason == null ? null : String(body.reason);
  // R2 — 광고 승인(approve L2)도 확인창 사유 필수 → 감사 함수 p_reason 으로 기록.
  if (body.action === "approve" && !parseAdminReason(reason)) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
  const ownerVisibleNotes =
    body.ownerVisibleNotes == null ? null : String(body.ownerVisibleNotes);

  if (body.action === "delete_safe_draft") {
    // AL-01 — 공통 광고 화면과 같은 삭제 함수. 이력(노출·결제·문의·막는 감사)은 서버가 센다.
    const del = await adminDeleteDeliveryAdDraftGuarded(sb, {
      adminUserId: admin.userId,
      productKind: body.productKind,
      campaignId,
      expectedLifecycle,
      expectedUpdatedAt,
      // R2 — 초안 삭제(delete L3) 확인창 사유를 삭제 감사 행 reason 에 남긴다.
      reason: parseAdminReason(reason),
    });
    if (!del.ok) {
      return NextResponse.json({ ok: false, error: del.error }, { status: del.httpStatus });
    }
    return NextResponse.json({ ok: true, result: { campaignId: del.campaignId, action: "delete_safe_draft" } });
  }

  // AL-05 — 재개 = L2: 사유 필수 (확인창 사유 → 감사 p_reason).
  if (body.action === "resume" && !parseAdminReason(reason)) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  if (body.action === "end") {
    // AL-04 · D-13 — 종료 = L3: 사유 필수. 진행 중(노출·정지)이면 귀책 + 비례 환급 함수로 종료한다.
    const table = body.productKind === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
    const { data: cur, error: curErr } = await sb
      .from(table)
      .select("id, lifecycle_status, updated_at")
      .eq("id", campaignId)
      .maybeSingle();
    if (curErr) {
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    if (!cur) {
      return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    }
    const curRow = cur as { lifecycle_status?: string; updated_at?: string };
    if (String(curRow.lifecycle_status ?? "") !== expectedLifecycle) {
      return NextResponse.json({ ok: false, error: "stale_lifecycle" }, { status: 409 });
    }
    if (String(curRow.updated_at ?? "") !== expectedUpdatedAt) {
      return NextResponse.json({ ok: false, error: "stale_updated_at" }, { status: 409 });
    }
    const preview = body.preview === true;
    const endReason = parseAdminReason(reason);
    if (isDeliveryAdLiveEndLifecycle(expectedLifecycle)) {
      if (!isDeliveryAdEndFault(body.fault)) {
        return NextResponse.json({ ok: false, error: "fault_required" }, { status: 400 });
      }
      if (!preview && !endReason) {
        return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
      }
      const ended = await adminEndDeliveryAdWithRefund(sb, {
        campaignId,
        adminUserId: admin.userId,
        fault: body.fault,
        reason: endReason ?? "",
        preview,
      });
      if (!ended.ok) {
        return NextResponse.json({ ok: false, error: ended.error }, { status: ended.httpStatus });
      }
      return NextResponse.json({
        ok: true,
        result: {
          campaignId,
          action: "end",
          preview: ended.preview,
          refundAmount: ended.refundAmount,
          paidAmount: ended.paidAmount,
          remainingSeconds: ended.remainingSeconds,
        },
      });
    }
    // 아직 노출 전(예약 등) 종료 — 기존 전이 함수 유지, 사유만 필수.
    if (preview) {
      return NextResponse.json({ ok: false, error: "preview_not_supported" }, { status: 400 });
    }
    if (!endReason) {
      return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    }
  }

  const result = await adminTransitionDeliveryAdCampaign(sb, {
    adminUserId: admin.userId,
    productKind: body.productKind,
    campaignId,
    action: body.action,
    expectedLifecycle,
    expectedUpdatedAt,
    reason,
    ownerVisibleNotes,
  });

  if (!result.ok) {
    const status =
      result.error === "stale_lifecycle" || result.error === "stale_updated_at"
        ? 409
        : result.error === "forbidden"
          ? 403
          : result.error === "campaign_not_found"
            ? 404
            : result.error === "reason_required" ||
                result.error === "illegal_transition" ||
                result.error === "funding_required" ||
                result.error === "period_expired" ||
                result.error === "period_ended"
              ? 422
              : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        detail: clientSafeErrorDetail(result.error, result.detail, status, "[admin delivery-ads actions]"),
        ...(result.error === "funding_required"
          ? { reasonKey: "admin_delivery_ad_funding_required" }
          : {}),
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, result });
}
