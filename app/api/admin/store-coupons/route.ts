import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  createStoreCouponCampaignAdmin,
  updateStoreCouponCampaignAdmin,
  type StoreCouponWriterError,
} from "@/lib/stores/store-coupon-campaign-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadAdminCouponControlCenter } from "@/lib/stores/load-admin-coupon-control-center";

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

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const loaded = await loadAdminCouponControlCenter(sb);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error, campaigns: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, campaigns: loaded.campaigns, writer: "admin_http" });
}

export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
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
  return NextResponse.json({ ok: true, campaign: result.row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
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
    if (adminAction === "approve") {
      await sb
        .from("store_coupon_campaigns")
        .update({
          lifecycle_state: "active",
          is_active: true,
          updated_by_user_id: userId,
        })
        .eq("id", campaignId);
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: "admin_approve",
        payload: {},
      });
      return NextResponse.json({ ok: true, lifecycle_state: "active" });
    }
    if (adminAction === "reject") {
      await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "rejected", is_active: false, updated_by_user_id: userId })
        .eq("id", campaignId);
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: "admin_reject",
        payload: {},
      });
      return NextResponse.json({ ok: true, lifecycle_state: "rejected" });
    }
    if (adminAction === "pause") {
      await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "paused", is_active: false, updated_by_user_id: userId })
        .eq("id", campaignId);
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: "admin_pause",
        payload: {},
      });
      return NextResponse.json({ ok: true, lifecycle_state: "paused" });
    }
    if (adminAction === "resume") {
      await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "active", is_active: true, updated_by_user_id: userId })
        .eq("id", campaignId);
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: "admin_resume",
        payload: {},
      });
      return NextResponse.json({ ok: true, lifecycle_state: "active" });
    }
    if (adminAction === "revoke") {
      const reason = String(rec?.reason ?? "").trim();
      if (reason.length < 2) {
        return NextResponse.json({ ok: false, error: "revoke_reason_required" }, { status: 400 });
      }
      await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "revoked", is_active: false, updated_by_user_id: userId })
        .eq("id", campaignId);
      await sb
        .from("coupon_user_entitlements")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("campaign_id", campaignId)
        .in("status", ["available", "restored"]);
      await sb.from("coupon_audit_events").insert({
        campaign_id: campaignId,
        actor_user_id: userId,
        action: "admin_force_revoke",
        payload: { reason },
      });
      return NextResponse.json({ ok: true, lifecycle_state: "revoked" });
    }
  }
  const result = await updateStoreCouponCampaignAdmin(sb, body, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, forbidden: result.forbidden },
      { status: writerErrorStatus(result.error) }
    );
  }
  return NextResponse.json({ ok: true, campaign: result.row });
}
