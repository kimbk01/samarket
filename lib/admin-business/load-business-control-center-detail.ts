/**
 * Single-store admin read for Business Control Center.
 * Reuses fee resolve + delivery distance SSOT — no parallel writers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveStoreDistancePolicy } from "@/lib/delivery/evaluate-delivery-serviceability";
import { loadDeliveryServiceabilityRuntimeContext } from "@/lib/delivery/load-delivery-serviceability-runtime";
import { resolveEffectiveStoreFeePolicy } from "@/lib/stores/store-fee-policy-resolve";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

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
  isOpen: boolean | null;
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
      fee: BusinessCcFeeSnapshot;
      delivery: BusinessCcDeliverySnapshot;
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

  const [profRes, salesRes, productCount, reviewCount, feeResolved, storeFeeOverrideRes, svcCtx, auditRes] =
    await Promise.all([
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
    ]);

  let displayLabel = "";
  let username: string | null = null;
  if (profRes.data) {
    const p = profRes.data as Record<string, unknown>;
    const display = String(p.display_name ?? p.nickname ?? "").trim();
    username = String(p.username ?? "").trim().replace(/^@+/, "") || null;
    displayLabel = labelFromDisplayAndUsername(display, username ?? "").trim();
  }
  if (!displayLabel) {
    displayLabel = ownerUserId ? ownerUserId.slice(0, 8) : "—";
  }

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

  const delivery: BusinessCcDeliverySnapshot = {
    deliveryAvailable:
      typeof row.delivery_available === "boolean" ? row.delivery_available : null,
    pickupAvailable:
      typeof row.pickup_available === "boolean" ? row.pickup_available : null,
    isOpen: typeof row.is_open === "boolean" ? row.is_open : null,
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

  return {
    ok: true,
    store: row,
    owner: {
      ownerUserId,
      displayLabel,
      username,
      handle: username ? `@${username}` : null,
    },
    salesPermission,
    stats: { productCount, reviewCount },
    fee,
    delivery,
    logs,
  };
}
