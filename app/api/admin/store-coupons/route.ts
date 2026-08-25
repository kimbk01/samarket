import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  createStoreCouponCampaignAdmin,
  updateStoreCouponCampaignAdmin,
  type StoreCouponWriterError,
} from "@/lib/stores/store-coupon-campaign-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isStoreCouponCampaignActive } from "@/lib/stores/store-coupon-campaign-authority";

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
    default:
      return 500;
  }
}

function computedState(row: {
  is_active: boolean;
  start_at: string;
  end_at: string;
}): "active" | "upcoming" | "expired" | "inactive" {
  if (!row.is_active) return "inactive";
  const now = Date.now();
  const start = Date.parse(row.start_at);
  const end = Date.parse(row.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "inactive";
  if (end <= now) return "expired";
  if (start > now) return "upcoming";
  if (
    isStoreCouponCampaignActive(
      {
        isActive: true,
        startAt: row.start_at,
        endAt: row.end_at,
      },
      now
    )
  ) {
    return "active";
  }
  return "inactive";
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data, error } = await sb
    .from("store_coupon_campaigns")
    .select(
      "id, store_id, title, discount_type, discount_value, min_order_amount, terms_copy, start_at, end_at, is_active, lifecycle_state, funding_mode, issue_limit, issued_count, spend_budget_php, reserved_spend_php, store_funded_amount, first_order_scope, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", campaigns: [] }, { status: 500 });
  }
  const ids = (data ?? []).map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const claimedBy = new Map<string, number>();
  const redeemedBy = new Map<string, number>();
  if (ids.length) {
    const { data: ents } = await sb
      .from("coupon_user_entitlements")
      .select("campaign_id, status")
      .in("campaign_id", ids);
    for (const e of ents ?? []) {
      const cid = String((e as { campaign_id?: string }).campaign_id ?? "");
      const st = String((e as { status?: string }).status ?? "");
      claimedBy.set(cid, (claimedBy.get(cid) ?? 0) + 1);
      if (st === "redeemed") redeemedBy.set(cid, (redeemedBy.get(cid) ?? 0) + 1);
    }
  }
  const { data: audits } = ids.length
    ? await sb
        .from("coupon_audit_events")
        .select("campaign_id, action, payload, created_at")
        .in("campaign_id", ids)
        .order("created_at", { ascending: false })
        .limit(400)
    : { data: [] as { campaign_id?: string; action?: string; payload?: unknown }[] };
  const lastAuditBy = new Map<string, { action: string; payload: unknown }>();
  for (const a of audits ?? []) {
    const cid = String((a as { campaign_id?: string }).campaign_id ?? "");
    if (!cid || lastAuditBy.has(cid)) continue;
    lastAuditBy.set(cid, {
      action: String((a as { action?: string }).action ?? ""),
      payload: (a as { payload?: unknown }).payload ?? {},
    });
  }
  const campaigns = (data ?? []).map((row) => {
    const id = String((row as { id?: string }).id ?? "");
    return {
      ...row,
      computed_state: computedState(row as { is_active: boolean; start_at: string; end_at: string }),
      claimed_count: claimedBy.get(id) ?? 0,
      redeemed_count: redeemedBy.get(id) ?? 0,
      budget_remaining:
        (row as { spend_budget_php?: number | null }).spend_budget_php != null
          ? Math.max(
              0,
              Number((row as { spend_budget_php?: number }).spend_budget_php) -
                Number((row as { reserved_spend_php?: number }).reserved_spend_php ?? 0)
            )
          : null,
      last_audit: lastAuditBy.get(id) ?? null,
    };
  });
  return NextResponse.json({ ok: true, campaigns, writer: "admin_http" });
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
      return NextResponse.json({ ok: true, lifecycle_state: "rejected" });
    }
    if (adminAction === "pause") {
      await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "paused", is_active: false, updated_by_user_id: userId })
        .eq("id", campaignId);
      return NextResponse.json({ ok: true, lifecycle_state: "paused" });
    }
    if (adminAction === "resume") {
      await sb
        .from("store_coupon_campaigns")
        .update({ lifecycle_state: "active", is_active: true, updated_by_user_id: userId })
        .eq("id", campaignId);
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
