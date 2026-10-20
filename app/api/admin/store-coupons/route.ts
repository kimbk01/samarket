import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  createStoreCouponCampaignAdmin,
  updateStoreCouponCampaignAdmin,
  type StoreCouponWriterError,
} from "@/lib/stores/store-coupon-campaign-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function writerErrorStatus(error: StoreCouponWriterError): number {
  switch (error) {
    case "forbidden_fields":
    case "missing_store_id":
    case "missing_id":
    case "empty_title":
    case "invalid_discount_type":
    case "invalid_discount_value":
    case "invalid_start_at":
    case "invalid_end_at":
    case "invalid_window":
      return 400;
    case "store_not_found":
    case "campaign_not_found":
      return 404;
    case "store_not_eligible":
      return 422;
    case "admin_funding_forbidden":
    case "admin_shared_share_required":
      return 400;
    default:
      return 500;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const sp = new URL(req.url).searchParams;
  const couponNumber = sp.get("couponNumber")?.trim() ?? "";
  const campaignId = sp.get("campaignId")?.trim() ?? "";
  /**
   * R7 서버 페이지 — `limit`(또는 `campaignId`) 이 있을 때만. 상태·재원·매장 필터·정렬·total·KPI 는 DB 함수가 정한다.
   * 쿠폰번호 검색(`couponNumber`)과 파라미터 없는 호출은 기존 응답 그대로.
   */
  if (!couponNumber && (sp.has("limit") || campaignId)) {
    const { loadAdminCouponCampaignPage } = await import("@/lib/stores/load-admin-coupon-campaign-page");
    const page = await loadAdminCouponCampaignPage(sb, {
      status: sp.get("status"),
      funding: sp.get("funding"),
      storeId: sp.get("store_id"),
      campaignId: campaignId || null,
      limit: campaignId ? 1 : Number(sp.get("limit")),
      offset: campaignId ? 0 : Number(sp.get("offset")),
    });
    if (!page.ok) {
      return NextResponse.json({ ok: false, error: page.error, campaigns: [] }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      campaigns: page.campaigns,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      kpi: page.kpi,
      stores: page.stores,
      recent: page.recent,
      writer: "admin_http",
    });
  }
  const { loadCouponCampaignOpsBundle } = await import("@/lib/stores/load-coupon-campaign-ops-bundle");
  const loaded = await loadCouponCampaignOpsBundle(sb, couponNumber ? { couponNumber } : undefined);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error, campaigns: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, campaigns: loaded.campaigns, writer: "admin_http" });
}

export async function POST(req: NextRequest) {
  /** 발행은 상태 전이(PATCH)와 같은 운영 권한 — 조회 권한만으로 쿠폰을 만들 수 없다. */
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await createStoreCouponCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }
  bumpStorePublicSharedCacheGeneration("admin_coupon.create"); // DEF-64
  await sb.from("coupon_audit_events").insert({
    campaign_id: result.row.id,
    actor_user_id: userId,
    action: "admin_create",
    payload: body && typeof body === "object" ? (body as Record<string, unknown>) : {},
  });
  return NextResponse.json({ ok: true, campaign: result.row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const adminAction = String(rec?.action ?? "").trim();
  const campaignId = String(rec?.id ?? "").trim();
  if (adminAction && campaignId) {
    // 상태 조건부 전이 (DEF-9) — 회수·종료된 쿠폰은 다시 활성화하지 않는다.
    const TRANSITIONS: Record<
      string,
      { from: readonly string[]; to: string; isActive: boolean; audit: string }
    > = {
      approve: { from: ["requested", "draft", "approved", "scheduled"], to: "active", isActive: true, audit: "admin_approve" },
      reject: { from: ["requested", "draft", "approved", "scheduled"], to: "rejected", isActive: false, audit: "admin_reject" },
      pause: { from: ["active", "scheduled"], to: "paused", isActive: false, audit: "admin_pause" },
      resume: { from: ["paused"], to: "active", isActive: true, audit: "admin_resume" },
    };
    const tr = TRANSITIONS[adminAction];
    if (tr) {
      const reason = String(rec?.reason ?? "").trim();
      if (adminAction === "reject" && reason.length < 2) {
        return NextResponse.json({ ok: false, error: "reject_reason_required" }, { status: 400 });
      }
      // R2 — 쿠폰 승인(approve L2)도 확인창 사유 필수 → coupon_audit_events.payload.reason.
      if (adminAction === "approve" && !parseAdminReason(reason)) {
        return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
      }
      const { data: updated, error: upErr } = await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: tr.to, is_active: tr.isActive, updated_by_user_id: userId })
        .eq("id", campaignId)
        .in("lifecycle_state", tr.from as string[])
        .select("id");
      if (upErr) {
        console.error("[admin coupon transition]", adminAction, upErr.message);
        return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
      }
      if (!updated || updated.length === 0) {
        return NextResponse.json({ ok: false, error: "invalid_coupon_transition" }, { status: 409 });
      }
      bumpStorePublicSharedCacheGeneration(`admin_coupon.${adminAction}`); // DEF-64
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: tr.audit,
        payload: reason ? { reason } : {},
      });
      return NextResponse.json({ ok: true, lifecycle_state: tr.to });
    }
    if (adminAction === "revoke") {
      const reason = String(rec?.reason ?? "").trim();
      if (reason.length < 2) {
        return NextResponse.json({ ok: false, error: "revoke_reason_required" }, { status: 400 });
      }
      const { data: revokedRows, error: revokeUpErr } = await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "revoked", is_active: false, updated_by_user_id: userId })
        .eq("id", campaignId)
        .neq("lifecycle_state", "revoked")
        .select("id");
      if (revokeUpErr) {
        console.error("[admin coupon revoke]", revokeUpErr.message);
        return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
      }
      if (!revokedRows || revokedRows.length === 0) {
        return NextResponse.json({ ok: false, error: "invalid_coupon_transition" }, { status: 409 });
      }
      bumpStorePublicSharedCacheGeneration("admin_coupon.revoke"); // DEF-64
      const { data: revokeResult, error: revokeErr } = await sb.rpc(
        "revoke_campaign_active_entitlements",
        {
          p_campaign_id: campaignId,
          p_actor_user_id: userId,
          p_reason: reason,
        }
      );
      if (revokeErr) {
        console.error("[admin coupon revoke entitlements]", revokeErr.message);
        return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
      }
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: "admin_force_revoke",
        payload: { reason, revoke_result: revokeResult ?? null },
      });
      return NextResponse.json({ ok: true, lifecycle_state: "revoked", revoke: revokeResult });
    }
  }
  const result = await updateStoreCouponCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }
  bumpStorePublicSharedCacheGeneration("admin_coupon.update"); // DEF-64
  await sb.from("coupon_audit_events").insert({
    campaign_id: result.row.id,
    actor_user_id: userId,
    action: "admin_update",
    payload: rec ?? {},
  });
  return NextResponse.json({ ok: true, campaign: result.row });
}
