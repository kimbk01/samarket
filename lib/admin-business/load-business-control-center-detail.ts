/**
 * Single-store admin read for Business Control Center.
 * Reuses fee resolve + delivery distance SSOT — no parallel writers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveStoreDistancePolicy } from "@/lib/delivery/evaluate-delivery-serviceability";
import { loadDeliveryServiceabilityRuntimeContext } from "@/lib/delivery/load-delivery-serviceability-runtime";
import {
  resolveCommerceForStatusControl,
} from "@/lib/admin-business/build-store-status-control";
import {
  loadBusinessCcKpiSummary,
  type BusinessCcKpiSummary,
} from "@/lib/admin-business/load-business-cc-kpi";
import { loadStorePointSummary } from "@/lib/stores/load-store-point-summary";
import {
  presentSettlementKind,
  presentStoreOpenKind,
  resolveBusinessOpsOwnerIdentity,
  taxonomyName,
  formatOpsDetailAddressLine,
  type BusinessOpsOpenKind,
  type BusinessOpsSettlementKind,
} from "@/lib/admin-business/business-ops-presentation";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { resolveEffectiveStoreFeePolicy } from "@/lib/stores/store-fee-policy-resolve";

export type { BusinessCcKpiSummary };

export type BusinessCcSalesPermission = {
  allowed_to_sell: boolean;
  sales_status: string;
  approved_at: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
} | null;

export type BusinessCcFeeSnapshot = {
  scope: string;
  policyId: string | null;
  policyName: string;
  feePercent: number;
  fixedFee: number;
  deliveryFeeMode: string;
  deliveryFeePercent: number;
  missing: boolean;
  /** Active store-scoped override row (for clear), if any */
  storeOverridePolicyId: string | null;
  storeOverrideFeePercent: number | null;
};

export type BusinessCcDeliverySnapshot = {
  deliveryAvailable: boolean | null;
  pickupAvailable: boolean | null;
  /** DB flag only — not Customer front-open */
  isOpen: boolean | null;
  /** resolveStoreFrontOpen SSOT (checkout) */
  frontOpenForCommerce: boolean;
  inBreak: boolean;
  hoursLabel: string | null;
  /** Free-text weekdays line from business_hours_json (Owner form) */
  weekdaysLabel: string | null;
  /** auto_business_hours.enabled */
  autoHoursEnabled: boolean | null;
  /** auto_business_hours.schedule_enforced */
  scheduleEnforced: boolean | null;
  /** business_hours_json.prep_time_minutes */
  prepTimeMinutes: number | null;
  breakRangeLabel: string | null;
  /**
   * CUSTOMER charged delivery fee (business_hours_json commerce extras).
   * NOT platform commission delivery_fee_mode on store_fee_policies.
   */
  customerDeliveryFeeMode: string | null;
  customerDeliveryFeePhp: number | null;
  customerMinOrderPhp: number | null;
  customerFreeDeliveryOverPhp: number | null;
  lat: number | null;
  lng: number | null;
  distancePolicyEnabled: boolean;
  applies: boolean;
  maxKm: number | null;
  policySource: string;
  storeOverrideMode: string | null;
  storeOverrideMaxKm: number | null;
};

export type BusinessCcStats = {
  productCount: number;
  reviewCount: number;
};

export type BusinessCcOwner = {
  ownerUserId: string;
  displayLabel: string;
  username: string | null;
  handle: string | null;
  /** false when profiles resolve failed — never show UUID as name */
  identityOk?: boolean;
};

export type BusinessCcOpsOverview = {
  openKind: BusinessOpsOpenKind;
  settlementKind: BusinessOpsSettlementKind;
  categoryName: string;
  regionLine: string;
  ratingAvg: number | null;
  reviewCountFromStore: number;
  pointBalance: number | null;
  pointCommerceBlocked: boolean;
  recentPointCredit: number | null;
  recentPointDebit: number | null;
  todayOrderCount: number;
  todaySalesAmount: number;
  productActiveCount: number;
  productSoldOutCount: number;
  productInactiveCount: number;
  reportTotalCount: number;
  /** Last 7 local days — order count + payment sum (proven from store_orders). */
  trend7d: Array<{ day: string; orderCount: number; salesAmount: number }>;
};

export type BusinessCcAuditLog = {
  id: string;
  actionType: string;
  adminId: string;
  note: string;
  createdAt: string;
};

async function countRows(
  sb: SupabaseClient,
  table: string,
  storeId: string
): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);
  if (error) return 0;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v != null && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function loadBusinessControlCenterDetail(
  sb: SupabaseClient,
  storeId: string
): Promise<
  | {
      ok: true;
      store: Record<string, unknown>;
      owner: BusinessCcOwner;
      salesPermission: BusinessCcSalesPermission;
      stats: BusinessCcStats;
      kpi: BusinessCcKpiSummary;
      fee: BusinessCcFeeSnapshot;
      delivery: BusinessCcDeliverySnapshot;
      ops: BusinessCcOpsOverview;
      logs: BusinessCcAuditLog[];
    }
  | { ok: false; error: "store_not_found" | "load_failed"; message?: string }
> {
  const id = storeId.trim();
  if (!id) return { ok: false, error: "store_not_found" };

  const { data: store, error } = await sb
    .from("stores")
    .select(
      "*, store_categories ( name, name_en, slug ), store_topics ( name, name_en, slug )"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: "load_failed", message: error.message };
  if (!store) return { ok: false, error: "store_not_found" };

  const row = store as Record<string, unknown>;
  const ownerUserId = String(row.owner_user_id ?? "").trim();

  const dayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const [
    profRes,
    salesRes,
    productCount,
    reviewCount,
    feeResolved,
    storeFeeOverrideRes,
    svcCtx,
    auditRes,
    pointSummary,
    todayOrdersRes,
    productActiveRes,
    productSoldOutRes,
    productInactiveRes,
    reportTotalRes,
    ledgerRes,
    settleStatusRes,
    trendOrdersRes,
  ] = await Promise.all([
      ownerUserId
        ? sb
            .from("profiles")
            .select("display_name, nickname, username")
            .eq("id", ownerUserId)
            .maybeSingle()
        : Promise.resolve({ data: null as Record<string, unknown> | null, error: null }),
      sb
        .from("store_sales_permissions")
        .select("allowed_to_sell, sales_status, approved_at, rejection_reason, suspension_reason")
        .eq("store_id", id)
        .maybeSingle(),
      countRows(sb, "store_products", id),
      countRows(sb, "store_reviews", id),
      resolveEffectiveStoreFeePolicy(sb, {
        storeId: id,
        storeCategoryId:
          typeof row.store_category_id === "string" ? row.store_category_id : null,
        storeTopicId: typeof row.store_topic_id === "string" ? row.store_topic_id : null,
      }),
      sb
        .from("store_fee_policies")
        .select("id, fee_percent, is_active, is_archived")
        .eq("store_id", id)
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then((res) =>
          res.error && /store_fee_policies|does not exist/i.test(res.error.message)
            ? { data: null, error: null }
            : res
        ),
      loadDeliveryServiceabilityRuntimeContext(sb),
      sb
        .from("audit_logs")
        .select("id, action, actor_id, created_at, after_json")
        .eq("target_type", "store")
        .eq("target_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      loadStorePointSummary(sb, {
        storeId: id,
        storeCategoryId:
          typeof row.store_category_id === "string" ? row.store_category_id : null,
      }),
      sb
        .from("store_orders")
        .select("id, payment_amount, created_at")
        .eq("store_id", id)
        .gte("created_at", dayStart),
      sb
        .from("store_products")
        .select("id", { count: "exact", head: true })
        .eq("store_id", id)
        .eq("product_status", "active"),
      sb
        .from("store_products")
        .select("id", { count: "exact", head: true })
        .eq("store_id", id)
        .eq("product_status", "sold_out"),
      sb
        .from("store_products")
        .select("id", { count: "exact", head: true })
        .eq("store_id", id)
        .in("product_status", ["hidden", "blocked"]),
      countRows(sb, "store_reports", id),
      sb
        .from("store_point_ledger")
        .select("amount, entry_type, created_at")
        .eq("store_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("store_settlements")
        .select("settlement_status")
        .eq("store_id", id)
        .in("settlement_status", ["held", "pending", "processing", "scheduled"])
        .limit(20),
      sb
        .from("store_orders")
        .select("payment_amount, created_at")
        .eq("store_id", id)
        .gte(
          "created_at",
          (() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - 6);
            return d.toISOString();
          })()
        )
        .limit(5000),
    ]);

  const ownerIdentity = resolveBusinessOpsOwnerIdentity({
    ownerUserId,
    displayName: profRes.data
      ? String((profRes.data as Record<string, unknown>).display_name ?? "")
      : null,
    nickname: profRes.data
      ? String((profRes.data as Record<string, unknown>).nickname ?? "")
      : null,
    username: profRes.data
      ? String((profRes.data as Record<string, unknown>).username ?? "")
      : null,
  });
  const displayLabel = ownerIdentity.ok ? ownerIdentity.label : "";
  const username = ownerIdentity.ok ? ownerIdentity.username : null;

  const salesRaw = salesRes.data as Record<string, unknown> | null;
  const salesPermission: BusinessCcSalesPermission = salesRaw
    ? {
        allowed_to_sell: Boolean(salesRaw.allowed_to_sell),
        sales_status: String(salesRaw.sales_status ?? ""),
        approved_at:
          typeof salesRaw.approved_at === "string" ? salesRaw.approved_at : null,
        rejection_reason:
          typeof salesRaw.rejection_reason === "string" ? salesRaw.rejection_reason : null,
        suspension_reason:
          typeof salesRaw.suspension_reason === "string"
            ? salesRaw.suspension_reason
            : null,
      }
    : null;

  const overrideRow = storeFeeOverrideRes.data as
    | { id?: string; fee_percent?: number | string; is_archived?: boolean | null }
    | null;
  const overrideUsable =
    overrideRow &&
    typeof overrideRow.id === "string" &&
    !(overrideRow.is_archived === true);

  const fee: BusinessCcFeeSnapshot = {
    scope: feeResolved.scope,
    policyId: feeResolved.policyId,
    policyName: feeResolved.policyName,
    feePercent: feeResolved.feePercent,
    fixedFee: feeResolved.fixedFee,
    deliveryFeeMode: feeResolved.deliveryFeeMode,
    deliveryFeePercent: feeResolved.deliveryFeePercent,
    missing: feeResolved.scope === "missing_policy",
    storeOverridePolicyId: overrideUsable ? String(overrideRow.id) : null,
    storeOverrideFeePercent: overrideUsable
      ? Number(overrideRow.fee_percent) || 0
      : null,
  };

  const override = svcCtx.overrides.stores[id] ?? null;
  const distanceEffective = resolveEffectiveStoreDistancePolicy(
    svcCtx.policy,
    svcCtx.overrides,
    id
  );

  const dbIsOpen = typeof row.is_open === "boolean" ? row.is_open : null;
  const commerce = resolveCommerceForStatusControl(row.business_hours_json, dbIsOpen);
  const extras = parseCommerceExtrasFromHoursJson(row.business_hours_json);
  const hoursRaw =
    row.business_hours_json &&
    typeof row.business_hours_json === "object" &&
    !Array.isArray(row.business_hours_json)
      ? (row.business_hours_json as Record<string, unknown>)
      : null;
  const weekdaysLabel = (() => {
    if (!hoursRaw) return null;
    const wd =
      typeof hoursRaw.weekdays === "string"
        ? hoursRaw.weekdays.trim()
        : typeof hoursRaw.weekdays_hours === "string"
          ? hoursRaw.weekdays_hours.trim()
          : "";
    return wd || null;
  })();
  const autoRec = (() => {
    if (!hoursRaw) return null;
    const a = hoursRaw.auto_business_hours;
    if (!a || typeof a !== "object" || Array.isArray(a)) return null;
    return a as Record<string, unknown>;
  })();
  const autoHoursEnabled = autoRec ? autoRec.enabled === true : null;
  const scheduleEnforced = autoRec ? autoRec.schedule_enforced === true : null;
  const autoHours = (() => {
    if (!autoRec || autoRec.enabled !== true || autoRec.schedule_enforced !== true) return null;
    const open = typeof autoRec.open === "string" ? autoRec.open.trim() : "";
    const close = typeof autoRec.close === "string" ? autoRec.close.trim() : "";
    if (!open || !close) return null;
    return `${open} ~ ${close}`;
  })();
  const prepTimeMinutes = (() => {
    if (!hoursRaw) return null;
    const raw = hoursRaw.prep_time_minutes ?? hoursRaw.prepTimeMinutes;
    return asFiniteNumber(raw);
  })();

  const delivery: BusinessCcDeliverySnapshot = {
    deliveryAvailable:
      typeof row.delivery_available === "boolean" ? row.delivery_available : null,
    pickupAvailable:
      typeof row.pickup_available === "boolean" ? row.pickup_available : null,
    isOpen: dbIsOpen,
    frontOpenForCommerce: commerce.isOpenForCommerce,
    inBreak: commerce.inBreak,
    hoursLabel: autoHours ?? weekdaysLabel,
    weekdaysLabel,
    autoHoursEnabled,
    scheduleEnforced,
    prepTimeMinutes,
    breakRangeLabel: commerce.breakConfigured ? commerce.breakRangeLabel || null : null,
    customerDeliveryFeeMode: extras.deliveryFeeMode,
    customerDeliveryFeePhp: extras.deliveryFeePhp,
    customerMinOrderPhp: extras.minOrderPhp,
    customerFreeDeliveryOverPhp: extras.freeDeliveryOverPhp,
    lat: asFiniteNumber(row.lat),
    lng: asFiniteNumber(row.lng),
    distancePolicyEnabled: Boolean(svcCtx.policy.enabled),
    applies: distanceEffective.applies,
    maxKm: distanceEffective.maxKm,
    policySource: distanceEffective.policySource,
    storeOverrideMode: override?.mode ?? null,
    storeOverrideMaxKm: override?.maxKm ?? null,
  };

  const logs: BusinessCcAuditLog[] = (auditRes.data ?? []).map(
    (r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      actionType: String(r.action ?? ""),
      adminId: String(r.actor_id ?? ""),
      note: r.after_json ? JSON.stringify(r.after_json).slice(0, 200) : "",
      createdAt: String(r.created_at ?? ""),
    })
  );

  const stats: BusinessCcStats = { productCount, reviewCount };
  const kpi = await loadBusinessCcKpiSummary(sb, id, stats);

  let recentPointCredit: number | null = null;
  let recentPointDebit: number | null = null;
  if (!ledgerRes.error && Array.isArray(ledgerRes.data)) {
    for (const entry of ledgerRes.data) {
      const amount = Math.round(Number((entry as { amount?: unknown }).amount) || 0);
      if (amount > 0 && recentPointCredit == null) recentPointCredit = amount;
      if (amount < 0 && recentPointDebit == null) recentPointDebit = Math.abs(amount);
      if (recentPointCredit != null && recentPointDebit != null) break;
    }
  }

  const settleStatuses = (settleStatusRes.data ?? []).map((r) =>
    String((r as { settlement_status?: unknown }).settlement_status ?? "")
  );
  const openKind = presentStoreOpenKind(row.business_hours_json, dbIsOpen).kind;

  const todayOrderRows = todayOrdersRes.data ?? [];
  const todayOrderCount = todayOrderRows.length;
  let todaySalesAmount = 0;
  for (const r of todayOrderRows) {
    todaySalesAmount += Math.max(0, Math.round(Number((r as { payment_amount?: unknown }).payment_amount) || 0));
  }

  const trendMap = new Map<string, { orderCount: number; salesAmount: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trendMap.set(key, { orderCount: 0, salesAmount: 0 });
  }
  for (const r of trendOrdersRes.data ?? []) {
    const at = String((r as { created_at?: unknown }).created_at ?? "");
    if (!at) continue;
    const key = new Date(at).toISOString().slice(0, 10);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    bucket.orderCount += 1;
    bucket.salesAmount += Math.max(
      0,
      Math.round(Number((r as { payment_amount?: unknown }).payment_amount) || 0)
    );
  }
  const trend7d = [...trendMap.entries()].map(([day, v]) => ({
    day,
    orderCount: v.orderCount,
    salesAmount: v.salesAmount,
  }));

  const ops: BusinessCcOpsOverview = {
    openKind,
    settlementKind: presentSettlementKind(settleStatuses),
    categoryName: taxonomyName(
      row.store_categories as { name?: string | null } | { name?: string | null }[] | null
    ),
    regionLine: formatOpsDetailAddressLine({
      region: typeof row.region === "string" ? row.region : null,
      city: typeof row.city === "string" ? row.city : null,
      district: typeof row.district === "string" ? row.district : null,
      address_line1: typeof row.address_line1 === "string" ? row.address_line1 : null,
      address_line2: typeof row.address_line2 === "string" ? row.address_line2 : null,
      detail_address: typeof row.detail_address === "string" ? row.detail_address : null,
      formatted_address:
        typeof row.formatted_address === "string" ? row.formatted_address : null,
    }),
    ratingAvg: asFiniteNumber(row.rating_avg),
    reviewCountFromStore: Math.max(0, Math.floor(Number(row.review_count) || reviewCount)),
    pointBalance: pointSummary ? pointSummary.pointBalance : asFiniteNumber(row.point_balance),
    pointCommerceBlocked:
      pointSummary?.pointCommerceBlocked === true || row.point_commerce_blocked === true,
    recentPointCredit,
    recentPointDebit,
    todayOrderCount,
    todaySalesAmount,
    productActiveCount: Math.max(0, Math.floor(Number(productActiveRes.count) || 0)),
    productSoldOutCount: Math.max(0, Math.floor(Number(productSoldOutRes.count) || 0)),
    productInactiveCount: Math.max(0, Math.floor(Number(productInactiveRes.count) || 0)),
    reportTotalCount: reportTotalRes,
    trend7d,
  };

  return {
    ok: true,
    store: row,
    owner: {
      ownerUserId,
      displayLabel,
      username,
      handle: username ? `@${username}` : null,
      identityOk: ownerIdentity.ok,
    },
    salesPermission,
    stats,
    kpi,
    fee,
    delivery,
    ops,
    logs,
  };
}
