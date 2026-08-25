import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isPaidCouponTypeForbidden } from "@/lib/stores/store-coupon-ssot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  parseStoreCouponCampaignCreateBody,
} from "@/lib/stores/store-coupon-campaign-validation";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertOwnedStore(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  userId: string,
  storeId: string
) {
  const { data } = await sb
    .from("stores")
    .select("id, owner_user_id")
    .eq("id", storeId)
    .maybeSingle();
  return data && String(data.owner_user_id) === userId;
}

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() ?? "";
  if (!storeId || !(await assertOwnedStore(sb, userId, storeId))) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }
  const { data, error } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .select(
      "id, store_id, title, discount_type, discount_value, min_order_amount, start_at, end_at, usage_end_at, claim_valid_days, is_active, lifecycle_state, funding_mode, issued_count, issue_limit, spend_budget_php, reserved_spend_php, store_funded_amount, max_discount, first_order_scope"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: "db_error", campaigns: [] }, { status: 500 });
  const rows = data ?? [];
  const ids = rows.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
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
  const campaigns = rows.map((row) => {
    const id = String((row as { id?: string }).id ?? "");
    return {
      ...row,
      claimed_count: claimedBy.get(id) ?? 0,
      redeemed_count: redeemedBy.get(id) ?? 0,
    };
  });
  return NextResponse.json({ ok: true, campaigns });
}

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  if (isPaidCouponTypeForbidden(body.discountType ?? body.discount_type)) {
    return NextResponse.json({ ok: false, error: "paid_coupon_forbidden" }, { status: 400 });
  }
  const fundingMode = String(body.fundingMode ?? body.funding_mode ?? "STORE_FUNDED");
  const parsed = parseStoreCouponCampaignCreateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  if (!(await assertOwnedStore(sb, userId, parsed.value.storeId))) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }
  const needsApproval = fundingMode !== "STORE_FUNDED";
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .insert({
      store_id: parsed.value.storeId,
      title: parsed.value.title,
      discount_type: parsed.value.discountType,
      discount_value: parsed.value.discountValue,
      min_order_amount: parsed.value.minOrderAmount,
      terms_copy: parsed.value.termsCopy,
      start_at: parsed.value.startAt,
      end_at: parsed.value.endAt,
      is_active: !needsApproval && parsed.value.isActive,
      lifecycle_state: needsApproval ? "requested" : parsed.value.isActive ? "active" : "draft",
      funding_mode: fundingMode,
      requires_admin_approval: needsApproval,
      max_discount: parsed.value.maxDiscount,
      issue_limit: parsed.value.issueLimit,
      spend_budget_php: parsed.value.spendBudgetPhp,
      first_order_scope: parsed.value.firstOrderScope,
      usage_end_at: parsed.value.usageEndAt,
      claim_valid_days: parsed.value.claimValidDays,
      store_funded_amount: parsed.value.storeFundedAmount,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      created_at: now,
      updated_at: now,
    })
    .select("id, lifecycle_state, funding_mode")
    .single();
  if (error || !data) {
    console.error("[owner coupon create]", error?.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, campaign: data });
}

export async function PATCH(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: string;
  } | null;
  const id = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const { data: row } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .select("id, store_id, lifecycle_state")
    .eq("id", id)
    .maybeSingle();
  if (!row || !(await assertOwnedStore(sb, userId, String(row.store_id)))) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }
  if (action === "pause") {
    await sb
      .from(STORE_COUPON_CAMPAIGN_TABLE)
      .update({ lifecycle_state: "paused", is_active: false, updated_by_user_id: userId })
      .eq("id", id);
    return NextResponse.json({ ok: true, lifecycle_state: "paused" });
  }
  if (action === "end") {
    await sb
      .from(STORE_COUPON_CAMPAIGN_TABLE)
      .update({ lifecycle_state: "ended", is_active: false, updated_by_user_id: userId })
      .eq("id", id);
    return NextResponse.json({ ok: true, lifecycle_state: "ended" });
  }
  if (action === "resume") {
    if (String(row.lifecycle_state) !== "paused") {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }
    await sb
      .from(STORE_COUPON_CAMPAIGN_TABLE)
      .update({ lifecycle_state: "active", is_active: true, updated_by_user_id: userId })
      .eq("id", id);
    return NextResponse.json({ ok: true, lifecycle_state: "active" });
  }
  if (action === "reissue") {
    const { data: src } = await sb.from(STORE_COUPON_CAMPAIGN_TABLE).select("*").eq("id", id).maybeSingle();
    if (!src) return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    const copy = src as Record<string, unknown>;
    const { data: created, error } = await sb
      .from(STORE_COUPON_CAMPAIGN_TABLE)
      .insert({
        store_id: copy.store_id,
        title: String(copy.title ?? ""),
        discount_type: copy.discount_type,
        discount_value: copy.discount_value,
        min_order_amount: copy.min_order_amount,
        terms_copy: copy.terms_copy,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        usage_end_at: copy.usage_end_at ?? null,
        claim_valid_days: copy.claim_valid_days ?? null,
        is_active: true,
        lifecycle_state: "active",
        funding_mode: "STORE_FUNDED",
        requires_admin_approval: false,
        max_discount: copy.max_discount ?? null,
        issue_limit: copy.issue_limit ?? null,
        spend_budget_php: copy.spend_budget_php ?? null,
        first_order_scope: copy.first_order_scope ?? null,
        store_funded_amount: copy.store_funded_amount ?? null,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      })
      .select("id, lifecycle_state")
      .single();
    if (error || !created) {
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, campaign: created });
  }
  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
