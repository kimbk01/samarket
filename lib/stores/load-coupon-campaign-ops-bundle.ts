import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assembleCouponControlCampaignView,
  projectCouponControlOrderFact,
  type CouponControlAuditFact,
  type CouponControlCampaignView,
  type CouponControlOrderFact,
} from "@/lib/stores/admin-coupon-control-realized";
import {
  resolveStoreCouponIssuerView,
  resolveStoreCouponPurposeView,
} from "@/lib/stores/store-coupon-issuer-resolve";
import { projectCouponOfferCostRatio } from "@/lib/stores/coupon-offer-roi";

const CAMPAIGN_SELECT =
  "id, store_id, title, discount_type, discount_value, min_order_amount, terms_copy, start_at, end_at, usage_end_at, is_active, lifecycle_state, funding_mode, issue_limit, issued_count, spend_budget_php, reserved_spend_php, store_funded_amount, first_order_scope, created_by_user_id, issuer_role, campaign_purpose, created_at, updated_at";

export type CouponInstanceOpsRow = {
  entitlement_id: string;
  coupon_number: string | null;
  buyer_user_id: string;
  buyer_label: string | null;
  status: string;
  issued_at: string;
  used_at: string | null;
  order_id: string | null;
  order_no: string | null;
  discount_amount: number;
  store_funded_amount: number;
  settlement_status: string | null;
};

export type CouponCampaignOpsView = CouponControlCampaignView & {
  created_at?: string | null;
  issuer: ReturnType<typeof resolveStoreCouponIssuerView>;
  purpose: ReturnType<typeof resolveStoreCouponPurposeView>;
  customer_description: string | null;
  active_held_count: number;
  expired_count: number;
  revoked_count: number;
  remaining_claim_slots: number | null;
  issued_reconciliation: {
    issued_count: number;
    entitlement_count: number;
    consistent: boolean;
  };
  instances: CouponInstanceOpsRow[];
  order_sales_php: number;
  /** SSOT ROI: GMV / store_funded when store_funded > 0; else null */
  cost_ratio: number | null;
};

async function loadActorLabels(
  sb: SupabaseClient,
  ids: string[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!ids.length) return out;
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, nickname, username")
    .in("id", ids);
  for (const p of data ?? []) {
    const id = String((p as { id?: string }).id ?? "");
    out[id] =
      String((p as { display_name?: string }).display_name ?? "").trim() ||
      String((p as { nickname?: string }).nickname ?? "").trim() ||
      String((p as { username?: string }).username ?? "").trim() ||
      "";
  }
  return out;
}

export async function loadCouponCampaignOpsBundle(
  sb: SupabaseClient,
  opts?: { campaignId?: string; couponNumber?: string; storeId?: string }
): Promise<
  | { ok: true; campaigns: CouponCampaignOpsView[] }
  | { ok: false; error: string }
> {
  let campaignQuery = sb.from("store_coupon_campaigns").select(CAMPAIGN_SELECT).order("created_at", {
    ascending: false,
  });
  if (opts?.campaignId) {
    campaignQuery = campaignQuery.eq("id", opts.campaignId);
  } else if (opts?.storeId) {
    campaignQuery = campaignQuery.eq("store_id", opts.storeId).limit(100);
  } else if (opts?.couponNumber) {
    const num = opts.couponNumber.trim();
    const { data: entHit } = await sb
      .from("coupon_user_entitlements")
      .select("campaign_id")
      .eq("coupon_number", num)
      .maybeSingle();
    const cid = String((entHit as { campaign_id?: string } | null)?.campaign_id ?? "");
    if (!cid) return { ok: true, campaigns: [] };
    campaignQuery = campaignQuery.eq("id", cid);
  } else {
    campaignQuery = campaignQuery.limit(200);
  }
  const { data: campaigns, error } = await campaignQuery;
  if (error) return { ok: false, error: "db_error" };

  const campaignRows = campaigns ?? [];

  const ids = campaignRows.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const storeIds = [
    ...new Set(campaignRows.map((r) => String((r as { store_id?: string }).store_id ?? "")).filter(Boolean)),
  ];

  const nameByStore: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name, slug").in("id", storeIds);
    for (const s of stores ?? []) {
      const id = String((s as { id?: string }).id ?? "");
      nameByStore[id] = String((s as { store_name?: string }).store_name ?? "").trim();
    }
  }

  const statusCounts = new Map<string, { all: number; redeemed: number; active: number; expired: number; revoked: number }>();
  const instancesByCampaign = new Map<string, CouponInstanceOpsRow[]>();
  const buyerIds = new Set<string>();
  const issuerIds = new Set<string>();

  if (ids.length) {
    let entQuery = sb
      .from("coupon_user_entitlements")
      .select(
        "id, campaign_id, buyer_user_id, status, coupon_number, created_at, expires_at, redeemed_order_id"
      )
      .in("campaign_id", ids);
    if (opts?.couponNumber) {
      entQuery = entQuery.eq("coupon_number", opts.couponNumber.trim());
    }
    const { data: ents } = await entQuery.order("created_at", { ascending: false });
    const now = Date.now();
    for (const e of ents ?? []) {
      const cid = String((e as { campaign_id?: string }).campaign_id ?? "");
      const st = String((e as { status?: string }).status ?? "");
      const exp = Date.parse(String((e as { expires_at?: string }).expires_at ?? ""));
      const counts = statusCounts.get(cid) ?? { all: 0, redeemed: 0, active: 0, expired: 0, revoked: 0 };
      counts.all += 1;
      if (st === "redeemed") counts.redeemed += 1;
      else if (st === "revoked") counts.revoked += 1;
      else if (st === "expired" || (Number.isFinite(exp) && exp <= now && (st === "available" || st === "restored")))
        counts.expired += 1;
      else if (st === "available" || st === "restored") counts.active += 1;
      statusCounts.set(cid, counts);
      const buyerId = String((e as { buyer_user_id?: string }).buyer_user_id ?? "");
      buyerIds.add(buyerId);
      // ALL-status Coupon Instance ledger (not redeemed-only)
      const il = instancesByCampaign.get(cid) ?? [];
      if (il.length < 100) {
        il.push({
          entitlement_id: String((e as { id?: string }).id ?? ""),
          coupon_number:
            (e as { coupon_number?: string | null }).coupon_number == null
              ? null
              : String((e as { coupon_number?: string }).coupon_number),
          buyer_user_id: buyerId,
          buyer_label: null,
          status: st || "available",
          issued_at: String((e as { created_at?: string }).created_at ?? ""),
          used_at: st === "redeemed" ? String((e as { created_at?: string }).created_at ?? "") : "",
          order_id: String((e as { redeemed_order_id?: string | null }).redeemed_order_id ?? "") || "",
          order_no: "",
          discount_amount: 0,
          store_funded_amount: 0,
          settlement_status: null,
        });
        instancesByCampaign.set(cid, il);
      }
    }
  }

  for (const row of campaignRows) {
    issuerIds.add(String((row as { created_by_user_id?: string }).created_by_user_id ?? ""));
  }
  const buyerLabels = await loadActorLabels(sb, [...buyerIds]);
  const issuerLabels = await loadActorLabels(sb, [...issuerIds]);

  const ordersByCampaign = new Map<string, CouponControlOrderFact[]>();
  if (ids.length) {
    const { data: reds } = await sb
      .from("store_coupon_redemptions")
      .select("campaign_id, order_id, user_coupon_id")
      .in("campaign_id", ids);
    const orderIds = [
      ...new Set((reds ?? []).map((r) => String((r as { order_id?: string }).order_id ?? "")).filter(Boolean)),
    ];
    const orderMap: Record<string, Record<string, unknown>> = {};
    const settleMap: Record<string, { net: unknown; status: string | null }> = {};
    if (orderIds.length) {
      const { data: orders } = await sb
        .from("store_orders")
        .select(
          "id, order_no, order_status, fulfillment_type, discount_amount, store_funded_amount, platform_funded_amount, payment_amount, created_at, buyer_user_id"
        )
        .in("id", orderIds);
      for (const o of orders ?? []) {
        orderMap[String((o as { id?: string }).id ?? "")] = o as Record<string, unknown>;
      }
      const { data: settles } = await sb
        .from("store_settlements")
        .select("order_id, net_settlement_amount, settlement_status")
        .in("order_id", orderIds);
      for (const s of settles ?? []) {
        const oid = String((s as { order_id?: string }).order_id ?? "");
        settleMap[oid] = {
          net: (s as { net_settlement_amount?: unknown }).net_settlement_amount,
          status: (s as { settlement_status?: string | null }).settlement_status ?? null,
        };
      }
    }
    const entByOrder = new Map<string, Record<string, unknown>>();
    if (orderIds.length) {
      const { data: entRows } = await sb
        .from("coupon_user_entitlements")
        .select("id, coupon_number, buyer_user_id, status, created_at, redeemed_order_id")
        .in("redeemed_order_id", orderIds);
      for (const e of entRows ?? []) {
        const oid = String((e as { redeemed_order_id?: string }).redeemed_order_id ?? "");
        if (oid) entByOrder.set(oid, e as Record<string, unknown>);
      }
    }
    for (const r of reds ?? []) {
      const cid = String((r as { campaign_id?: string }).campaign_id ?? "");
      const oid = String((r as { order_id?: string }).order_id ?? "");
      const o = orderMap[oid];
      if (!o) continue;
      const st = settleMap[oid];
      const fact = projectCouponControlOrderFact({
        order_id: oid,
        order_no: o.order_no as string,
        order_status: o.order_status as string,
        fulfillment_type: o.fulfillment_type as string,
        discount_amount: o.discount_amount,
        store_funded_amount: o.store_funded_amount,
        platform_funded_amount: o.platform_funded_amount,
        net_settlement_amount: st?.net,
        settlement_status: st?.status ?? null,
      });
      const list = ordersByCampaign.get(cid) ?? [];
      list.push(fact);
      ordersByCampaign.set(cid, list);

      const ent = entByOrder.get(oid);
      if (ent) {
        const eid = String(ent.id ?? "");
        const il = instancesByCampaign.get(cid) ?? [];
        const idx = il.findIndex((x) => x.entitlement_id === eid);
        const enriched: CouponInstanceOpsRow = {
          entitlement_id: eid,
          coupon_number: ent.coupon_number == null ? null : String(ent.coupon_number),
          buyer_user_id: String(ent.buyer_user_id ?? o.buyer_user_id ?? ""),
          buyer_label: buyerLabels[String(ent.buyer_user_id ?? "")] || null,
          status: String(ent.status ?? "redeemed"),
          issued_at: String(ent.created_at ?? ""),
          used_at: String(o.created_at ?? ""),
          order_id: oid,
          order_no: String(o.order_no ?? ""),
          discount_amount: fact.discount_amount,
          store_funded_amount: fact.store_funded_amount,
          settlement_status: fact.settlement_status,
        };
        if (idx >= 0) il[idx] = enriched;
        else il.push(enriched);
        instancesByCampaign.set(cid, il);
      }
    }
  }

  const auditsByCampaign = new Map<string, CouponControlAuditFact[]>();
  if (ids.length) {
    const { data: audits } = await sb
      .from("coupon_audit_events")
      .select("campaign_id, actor_user_id, action, payload, created_at")
      .in("campaign_id", ids)
      .order("created_at", { ascending: false })
      .limit(800);
    for (const a of audits ?? []) {
      const cid = String((a as { campaign_id?: string }).campaign_id ?? "");
      const payload = (a as { payload?: unknown }).payload;
      const reason =
        payload && typeof payload === "object" && payload && "reason" in payload
          ? String((payload as { reason?: unknown }).reason ?? "").trim() || null
          : null;
      const actorId = String((a as { actor_user_id?: string }).actor_user_id ?? "");
      const fact: CouponControlAuditFact = {
        action: String((a as { action?: string }).action ?? ""),
        reason,
        actor_label: issuerLabels[actorId] || buyerLabels[actorId] || null,
        created_at: String((a as { created_at?: string }).created_at ?? ""),
      };
      const list = auditsByCampaign.get(cid) ?? [];
      if (list.length < 20) list.push(fact);
      auditsByCampaign.set(cid, list);
    }
  }

  const views: CouponCampaignOpsView[] = [];
  for (const row of campaignRows) {
    const id = String((row as { id?: string }).id ?? "");
    const storeId = String((row as { store_id?: string }).store_id ?? "");
    const counts = statusCounts.get(id) ?? { all: 0, redeemed: 0, active: 0, expired: 0, revoked: 0 };
    const issuedCount = Number((row as { issued_count?: number }).issued_count ?? 0);
    const issueLimit =
      (row as { issue_limit?: number | null }).issue_limit == null
        ? null
        : Number((row as { issue_limit?: number }).issue_limit);
    const orders = ordersByCampaign.get(id) ?? [];
    let orderSalesPhp = 0;
    if (orders.length) {
      const orderIds = orders.map((o) => o.order_id);
      const { data: payRows } = await sb
        .from("store_orders")
        .select("id, payment_amount")
        .in("id", orderIds);
      for (const p of payRows ?? []) {
        orderSalesPhp += Math.round(Number((p as { payment_amount?: number }).payment_amount ?? 0));
      }
    }

    const base = assembleCouponControlCampaignView({
      campaign: row as Record<string, unknown>,
      storeName: nameByStore[storeId] ?? "",
      claimedCount: counts.all,
      redeemedCount: counts.redeemed,
      orders,
      audits: auditsByCampaign.get(id) ?? [],
    });

    views.push({
      ...base,
      created_at: (row as { created_at?: string | null }).created_at
        ? String((row as { created_at?: string }).created_at)
        : null,
      issuer: resolveStoreCouponIssuerView({
        issuerRole: (row as { issuer_role?: unknown }).issuer_role,
        createdByUserId: (row as { created_by_user_id?: unknown }).created_by_user_id,
        actorLabel: issuerLabels[String((row as { created_by_user_id?: string }).created_by_user_id ?? "")] || null,
      }),
      purpose: resolveStoreCouponPurposeView((row as { campaign_purpose?: unknown }).campaign_purpose),
      customer_description:
        (row as { terms_copy?: string | null }).terms_copy == null
          ? null
          : String((row as { terms_copy?: string | null }).terms_copy),
      active_held_count: counts.active,
      expired_count: counts.expired,
      revoked_count: counts.revoked,
      remaining_claim_slots:
        issueLimit == null ? null : Math.max(0, issueLimit - issuedCount),
      issued_reconciliation: {
        issued_count: issuedCount,
        entitlement_count: counts.all,
        consistent: issuedCount === counts.all,
      },
      instances: (instancesByCampaign.get(id) ?? []).map((inst) => ({
        ...inst,
        buyer_label: inst.buyer_label || buyerLabels[inst.buyer_user_id] || null,
      })),
      order_sales_php: orderSalesPhp,
      cost_ratio: projectCouponOfferCostRatio({
        orderSalesPhp,
        storeFundedPhp: base.realized.store_funded,
      }),
    });
  }

  return { ok: true, campaigns: views };
}

export async function loadAdminCouponControlCenter(
  sb: SupabaseClient
): Promise<{ ok: true; campaigns: CouponControlCampaignView[] } | { ok: false; error: string }> {
  const loaded = await loadCouponCampaignOpsBundle(sb);
  if (!loaded.ok) return loaded;
  return { ok: true, campaigns: loaded.campaigns };
}
