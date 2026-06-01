import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_STORE_POINT_POLICY,
  type StorePointPolicyLike,
} from "@/lib/stores/compute-store-point-fee";

export type EffectiveStorePointPolicy = {
  policyId: string | null;
  policyName: string;
  feeMode: string;
  fixedPoint: number;
  percentRate: number;
  minimumPoint: number;
  maximumPoint: number;
  snapshot: Record<string, unknown>;
};

type PolicyRow = StorePointPolicyLike & {
  id: string;
  policy_name: string;
};

function nowIso() {
  return new Date().toISOString();
}

function mapRow(row: PolicyRow): EffectiveStorePointPolicy {
  return {
    policyId: row.id,
    policyName: row.policy_name,
    feeMode: String(row.fee_mode ?? "fixed"),
    fixedPoint: Math.max(0, Math.floor(Number(row.fixed_point) || 0)),
    percentRate: Number(row.percent_rate) || 0,
    minimumPoint: Math.max(0, Math.floor(Number(row.minimum_point) || 0)),
    maximumPoint: Math.max(0, Math.floor(Number(row.maximum_point) || 0)),
    snapshot: row as unknown as Record<string, unknown>,
  };
}

function fallbackPolicy(): EffectiveStorePointPolicy {
  return {
    policyId: null,
    policyName: "fallback:default_10p",
    feeMode: "fixed",
    fixedPoint: 10,
    percentRate: 0,
    minimumPoint: 0,
    maximumPoint: 0,
    snapshot: { source: "fallback", ...DEFAULT_STORE_POINT_POLICY },
  };
}

const POLICY_SELECT =
  "id, policy_name, fee_mode, fixed_point, percent_rate, minimum_point, maximum_point";

async function fetchOnePolicy(
  sb: SupabaseClient,
  scope: "store" | "category" | "default",
  id: string | null
): Promise<{ row: PolicyRow | null; missing: boolean }> {
  const now = nowIso();
  let q = sb
    .from("store_point_policies")
    .select(POLICY_SELECT)
    .eq("is_active", true)
    .eq("is_archived", false)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("priority", { ascending: true })
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (scope === "store" && id) q = q.eq("store_id", id);
  else if (scope === "category" && id) q = q.eq("category_id", id).is("store_id", null);
  else q = q.is("store_id", null).is("category_id", null);

  const { data, error } = await q;
  if (error) {
    if (/store_point_policies/i.test(error.message) && /does not exist/i.test(error.message)) {
      return { row: null, missing: true };
    }
    console.error("[loadEffectiveStorePointPolicy]", error);
    return { row: null, missing: false };
  }
  const row = ((data ?? [])[0] ?? null) as PolicyRow | null;
  return { row, missing: false };
}

export function effectivePolicyToFeeLike(policy: EffectiveStorePointPolicy): StorePointPolicyLike {
  return {
    fee_mode: policy.feeMode,
    fixed_point: policy.fixedPoint,
    percent_rate: policy.percentRate,
    minimum_point: policy.minimumPoint,
    maximum_point: policy.maximumPoint,
  };
}

export async function loadEffectiveStorePointPolicy(
  sb: SupabaseClient,
  opts: { storeId: string; storeCategoryId?: string | null }
): Promise<EffectiveStorePointPolicy> {
  const sid = opts.storeId.trim();
  const catId = opts.storeCategoryId?.trim() || null;

  if (sid) {
    const storeRes = await fetchOnePolicy(sb, "store", sid);
    if (storeRes.missing) return fallbackPolicy();
    if (storeRes.row) return mapRow(storeRes.row);
  }

  if (catId) {
    const catRes = await fetchOnePolicy(sb, "category", catId);
    if (catRes.missing) return fallbackPolicy();
    if (catRes.row) return mapRow(catRes.row);
  }

  const defRes = await fetchOnePolicy(sb, "default", null);
  if (defRes.missing) return fallbackPolicy();
  if (defRes.row) return mapRow(defRes.row);

  return fallbackPolicy();
}
