import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assembleCouponControlCampaignView,
  projectCouponControlOrderFact,
  type CouponControlAuditFact,
  type CouponControlCampaignView,
  type CouponControlOrderFact,
} from "@/lib/stores/admin-coupon-control-realized";

const CAMPAIGN_SELECT =
  "id, store_id, title, discount_type, discount_value, min_order_amount, terms_copy, start_at, end_at, usage_end_at, is_active, lifecycle_state, funding_mode, issue_limit, issued_count, spend_budget_php, reserved_spend_php, store_funded_amount, first_order_scope, created_at, updated_at";

export async function loadAdminCouponControlCenter(
  sb: SupabaseClient
): Promise<{ ok: true; campaigns: CouponControlCampaignView[] } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("store_coupon_campaigns")
    .select(CAMPAIGN_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: "db_error" };
  const campaigns = data ?? [];
  const ids = campaigns.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const storeIds = [
    ...new Set(campaigns.map((r) => String((r as { store_id?: string }).store_id ?? "")).filter(Boolean)),
  ];

  const nameByStore: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name, slug").in("id", storeIds);
    for (const s of stores ?? []) {
      const id = String((s as { id?: string }).id ?? "");
      const name = String((s as { store_name?: string }).store_name ?? "").trim();
      const slug = String((s as { slug?: string }).slug ?? "").trim();
      nameByStore[id] = name || slug || "";
    }
  }

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

  const ordersByCampaign = new Map<string, CouponControlOrderFact[]>();
  if (ids.length) {
    const { data: reds } = await sb
      .from("store_coupon_redemptions")
      .select("campaign_id, order_id")
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
          "id, order_no, order_status, fulfillment_type, discount_amount, store_funded_amount, platform_funded_amount"
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
    const actorIds = [
      ...new Set(
        (audits ?? [])
          .map((a) => String((a as { actor_user_id?: string }).actor_user_id ?? ""))
          .filter(Boolean)
      ),
    ];
    const actorLabel: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, display_name, nickname, username")
        .in("id", actorIds);
      for (const p of profiles ?? []) {
        const id = String((p as { id?: string }).id ?? "");
        actorLabel[id] =
          String((p as { display_name?: string }).display_name ?? "").trim() ||
          String((p as { nickname?: string }).nickname ?? "").trim() ||
          String((p as { username?: string }).username ?? "").trim() ||
          "";
      }
    }
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
        actor_label: actorLabel[actorId] || null,
        created_at: String((a as { created_at?: string }).created_at ?? ""),
      };
      const list = auditsByCampaign.get(cid) ?? [];
      if (list.length < 20) list.push(fact);
      auditsByCampaign.set(cid, list);
    }
  }

  const views = campaigns.map((row) => {
    const id = String((row as { id?: string }).id ?? "");
    const storeId = String((row as { store_id?: string }).store_id ?? "");
    return assembleCouponControlCampaignView({
      campaign: row as Record<string, unknown>,
      storeName: nameByStore[storeId] ?? "",
      claimedCount: claimedBy.get(id) ?? 0,
      redeemedCount: redeemedBy.get(id) ?? 0,
      orders: ordersByCampaign.get(id) ?? [],
      audits: auditsByCampaign.get(id) ?? [],
    });
  });
  return { ok: true, campaigns: views };
}
