import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  isPaidCouponTypeForbidden,
  resolveOwnerSelfIssuedCreateFunding,
} from "@/lib/stores/store-coupon-ssot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { ownerStoreOperationalWriteBlockById } from "@/lib/stores/owner-product-gate";
import {
  parseStoreCouponCampaignCreateBody,
} from "@/lib/stores/store-coupon-campaign-validation";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import {
  checkOwnerCouponTransition,
  couponIsActiveForLifecycle,
  isOwnerCouponTransitionAction,
  parseCouponClientRequestId,
  STORE_COUPON_MAX_USES_PER_USER,
} from "@/lib/stores/store-coupon-effective-state";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

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
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId")?.trim() ?? "";
  const ops = url.searchParams.get("ops") === "1";
  const campaignId = url.searchParams.get("campaignId")?.trim() ?? "";

  if (ops && campaignId) {
    const { loadCouponCampaignOpsBundle } = await import("@/lib/stores/load-coupon-campaign-ops-bundle");
    const loaded = await loadCouponCampaignOpsBundle(sb, { campaignId });
    if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
    const campaign = loaded.campaigns[0] ?? null;
    if (campaign && !(await assertOwnedStore(sb, userId, String(campaign.store_id)))) {
      return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, campaign });
  }

  if (!storeId || !(await assertOwnedStore(sb, userId, storeId))) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }
  const { loadCouponCampaignOpsBundle } = await import("@/lib/stores/load-coupon-campaign-ops-bundle");
  const loaded = await loadCouponCampaignOpsBundle(sb, { storeId });
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error, campaigns: [] }, { status: 500 });
  const campaigns = loaded.campaigns.map((c) => ({
    id: c.id,
    store_id: c.store_id,
    title: c.title,
    discount_type: c.discount_type,
    discount_value: c.discount_value,
    min_order_amount: c.min_order_amount,
    start_at: c.start_at,
    end_at: c.end_at,
    usage_end_at: c.usage_end_at,
    is_active: c.is_active,
    lifecycle_state: c.lifecycle_state,
    paused_by: c.paused_by,
    funding_mode: c.funding_mode,
    issued_count: c.issued_count,
    issue_limit: c.issue_limit,
    spend_budget_php: c.spend_budget_php,
    reserved_spend_php: c.reserved_spend_php,
    max_discount: null as number | null,
    first_order_scope: c.first_order_scope,
    created_at: c.created_at ?? c.start_at,
    claimed_count: c.claimed_count,
    redeemed_count: c.redeemed_count,
    active_held_count: c.active_held_count,
    remaining_claim_slots: c.remaining_claim_slots,
    order_sales_php: c.order_sales_php,
    realized_discount_php: c.realized.customer_discount,
    realized_store_php: c.realized.store_funded,
    realized_platform_php: c.realized.platform_funded,
    cost_ratio: c.cost_ratio,
  }));
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
  const parsed = parseStoreCouponCampaignCreateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const funding = resolveOwnerSelfIssuedCreateFunding(body);
  if (!funding.ok) {
    return NextResponse.json({ ok: false, error: funding.error }, { status: 400 });
  }
  if (!(await assertOwnedStore(sb, userId, parsed.value.storeId))) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }
  const createBlock = await ownerStoreOperationalWriteBlockById(sb, parsed.value.storeId);
  if (createBlock) {
    return NextResponse.json({ ok: false, error: createBlock.error }, { status: createBlock.status });
  }
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
      is_active: parsed.value.isActive,
      lifecycle_state: parsed.value.isActive ? "active" : "draft",
      max_uses_per_user: STORE_COUPON_MAX_USES_PER_USER,
      funding_mode: funding.write.funding_mode,
      requires_admin_approval: funding.write.requires_admin_approval,
      max_discount: parsed.value.maxDiscount,
      issue_limit: parsed.value.issueLimit,
      spend_budget_php: parsed.value.spendBudgetPhp,
      first_order_scope: parsed.value.firstOrderScope,
      usage_end_at: parsed.value.usageEndAt,
      claim_valid_days: parsed.value.claimValidDays,
      store_funded_amount: funding.write.store_funded_amount,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      issuer_role: "owner",
      campaign_purpose: parsed.value.campaignPurpose,
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

type OwnerCouponSb = NonNullable<ReturnType<typeof tryGetSupabaseForStores>>;

/** 감사 기록 — 실패해도 전이 응답은 바꾸지 않는다(이미 커밋됨). 실패는 로그로 남긴다. */
async function appendOwnerCouponAudit(
  sb: OwnerCouponSb,
  campaignId: string,
  actorUserId: string,
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await sb.from("coupon_audit_events").insert({
    campaign_id: campaignId,
    actor_user_id: actorUserId,
    action,
    payload,
  });
  if (error) console.error("[owner coupon audit]", action, error.message);
}

async function findReissueByRequestId(
  sb: OwnerCouponSb,
  storeId: string,
  sourceId: string,
  clientRequestId: string
): Promise<{ id: string; lifecycle_state: string } | null> {
  const { data } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .select("id, lifecycle_state")
    .eq("store_id", storeId)
    .eq("source_campaign_id", sourceId)
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  return data ? { id: String(data.id), lifecycle_state: String(data.lifecycle_state) } : null;
}

export async function PATCH(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: string;
    clientRequestId?: unknown;
  } | null;
  const id = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const { data: row, error: rowErr } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .select("id, store_id, lifecycle_state, is_active, paused_by, funding_mode, issuer_role")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) {
    console.error("[owner coupon patch load]", rowErr.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  if (!row || !(await assertOwnedStore(sb, userId, String(row.store_id)))) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }
  const storeId = String(row.store_id);
  const patchBlock = await ownerStoreOperationalWriteBlockById(sb, storeId);
  if (patchBlock) {
    return NextResponse.json({ ok: false, error: patchBlock.error }, { status: patchBlock.status });
  }
  // SSOT: Owner may mutate STORE_FUNDED offers only (platform offers = read/KPI).
  if (String((row as { funding_mode?: string }).funding_mode ?? "STORE_FUNDED") !== "STORE_FUNDED") {
    return NextResponse.json({ ok: false, error: "owner_platform_offer_readonly" }, { status: 403 });
  }

  if (isOwnerCouponTransitionAction(action)) {
    // 3-C IA-04 (D-18 권장안) — 전이표 선검사 + 같은 조건의 CAS UPDATE. 0행 = 그 사이 상태가 바뀜 → 409.
    const check = checkOwnerCouponTransition(action, row as Parameters<typeof checkOwnerCouponTransition>[1]);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: check.status });
    }
    const tr = check.transition;
    let q = sb
      .from(STORE_COUPON_CAMPAIGN_TABLE)
      .update({
        lifecycle_state: tr.to,
        is_active: couponIsActiveForLifecycle(tr.to),
        updated_by_user_id: userId,
        updated_at: new Date().toISOString(),
        ...(tr.pausedBy !== undefined ? { paused_by: tr.pausedBy } : {}),
      })
      .eq("id", id)
      .eq("store_id", storeId)
      .in("lifecycle_state", tr.from as string[]);
    if (tr.requireIsActive) q = q.eq("is_active", true);
    if (tr.excludeAdminPaused) q = q.or("paused_by.is.null,paused_by.eq.owner");
    const { data: updated, error: upErr } = await q.select("id");
    if (upErr) {
      console.error("[owner coupon transition]", action, upErr.message);
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ ok: false, error: "invalid_transition" }, { status: 409 });
    }
    bumpStorePublicSharedCacheGeneration(`owner_coupon.${action}`);
    await appendOwnerCouponAudit(sb, id, userId, tr.audit, { from: String(row.lifecycle_state), to: tr.to });
    return NextResponse.json({ ok: true, lifecycle_state: tr.to });
  }

  if (action === "reissue") {
    // 3-C IA-05 — 폼 단위 고정 키. 같은 키 재요청은 기존 행을 돌려준다(200, idempotent).
    const clientRequestId = parseCouponClientRequestId(body?.clientRequestId);
    if (!clientRequestId) {
      return NextResponse.json({ ok: false, error: "missing_client_request_id" }, { status: 400 });
    }
    const prior = await findReissueByRequestId(sb, storeId, id, clientRequestId);
    if (prior) return NextResponse.json({ ok: true, campaign: prior, idempotent: true });

    const { data: src, error: srcErr } = await sb.from(STORE_COUPON_CAMPAIGN_TABLE).select("*").eq("id", id).maybeSingle();
    if (srcErr) {
      console.error("[owner coupon reissue load]", srcErr.message);
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    if (!src) return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    // D-18 / ND-1 — 관리자가 회수·반려한 쿠폰은 오너 재발행으로 되살리지 않는다(종료 쿠폰 재발행은 허용).
    const srcLifecycle = String((src as Record<string, unknown>).lifecycle_state ?? "").trim();
    if (srcLifecycle === "revoked" || srcLifecycle === "rejected") {
      return NextResponse.json({ ok: false, error: "reissue_source_blocked" }, { status: 409 });
    }
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
        max_uses_per_user: STORE_COUPON_MAX_USES_PER_USER,
        funding_mode: "STORE_FUNDED",
        requires_admin_approval: false,
        max_discount: copy.max_discount ?? null,
        issue_limit: copy.issue_limit ?? null,
        spend_budget_php: copy.spend_budget_php ?? null,
        first_order_scope: copy.first_order_scope ?? null,
        store_funded_amount: copy.store_funded_amount ?? null,
        created_by_user_id: userId,
        updated_by_user_id: userId,
        issuer_role: "owner",
        campaign_purpose:
          copy.campaign_purpose != null && String(copy.campaign_purpose).trim()
            ? String(copy.campaign_purpose)
            : "store_promotion",
        source_campaign_id: id,
        client_request_id: clientRequestId,
      })
      .select("id, lifecycle_state")
      .single();
    if (error || !created) {
      if (error?.code === "23505") {
        // 동시 재요청 — 먼저 들어간 행을 돌려준다.
        const raced = await findReissueByRequestId(sb, storeId, id, clientRequestId);
        if (raced) return NextResponse.json({ ok: true, campaign: raced, idempotent: true });
      }
      console.error("[owner coupon reissue]", error?.message);
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    bumpStorePublicSharedCacheGeneration("owner_coupon.reissue");
    await appendOwnerCouponAudit(sb, String(created.id), userId, "owner_reissue", { source_campaign_id: id });
    return NextResponse.json({ ok: true, campaign: created });
  }
  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
