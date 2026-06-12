import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExposurePolicyLog,
  ExposurePolicyLogActionType,
  ExposureScorePolicy,
  ExposureSurface,
} from "@/lib/types/exposure";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mapExposureScorePolicyRow(row: Record<string, unknown>): ExposureScorePolicy {
  return {
    id: String(row.id ?? ""),
    surface: String(row.surface ?? "home") as ExposureSurface,
    isActive: Boolean(row.is_active ?? row.isActive ?? true),
    policyName: String(row.policy_name ?? row.policyName ?? ""),
    latestWeight: num(row.latest_weight ?? row.latestWeight, 1),
    popularWeight: num(row.popular_weight ?? row.popularWeight),
    nearbyWeight: num(row.nearby_weight ?? row.nearbyWeight),
    premiumBoostWeight: num(row.premium_boost_weight ?? row.premiumBoostWeight),
    businessBoostWeight: num(row.business_boost_weight ?? row.businessBoostWeight),
    adBoostWeight: num(row.ad_boost_weight ?? row.adBoostWeight),
    pointPromotionBoostWeight: num(row.point_promotion_boost_weight ?? row.pointPromotionBoostWeight),
    bumpBoostWeight: num(row.bump_boost_weight ?? row.bumpBoostWeight),
    exactRegionMatchWeight: num(row.exact_region_match_weight ?? row.exactRegionMatchWeight),
    sameCityWeight: num(row.same_city_weight ?? row.sameCityWeight),
    sameBarangayWeight: num(row.same_barangay_weight ?? row.sameBarangayWeight),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ""),
    adminMemo: row.admin_memo != null ? String(row.admin_memo) : row.adminMemo != null ? String(row.adminMemo) : undefined,
  };
}

function mapExposurePolicyLogRow(row: Record<string, unknown>): ExposurePolicyLog {
  return {
    id: String(row.id ?? ""),
    policyId: String(row.policy_id ?? ""),
    surface: String(row.surface ?? "home") as ExposureSurface,
    actionType: String(row.action_type ?? "update") as ExposurePolicyLogActionType,
    adminId: String(row.admin_id ?? ""),
    adminNickname: String(row.admin_nickname ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist");
}

export async function listExposureScorePolicies(
  sb: SupabaseClient
): Promise<ExposureScorePolicy[]> {
  const { data, error } = await sb
    .from("exposure_score_policies")
    .select("*")
    .order("surface", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapExposureScorePolicyRow(r as Record<string, unknown>));
}

export async function getExposureScorePolicyBySurfaceFromDb(
  sb: SupabaseClient,
  surface: ExposureSurface
): Promise<ExposureScorePolicy | null> {
  const { data, error } = await sb
    .from("exposure_score_policies")
    .select("*")
    .eq("surface", surface)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapExposureScorePolicyRow(data as Record<string, unknown>);
}

export async function updateExposureScorePolicy(
  sb: SupabaseClient,
  id: string,
  patch: Partial<ExposureScorePolicy>
): Promise<ExposureScorePolicy> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.policyName != null) payload.policy_name = patch.policyName;
  if (patch.isActive != null) payload.is_active = patch.isActive;
  if (patch.latestWeight != null) payload.latest_weight = patch.latestWeight;
  if (patch.popularWeight != null) payload.popular_weight = patch.popularWeight;
  if (patch.nearbyWeight != null) payload.nearby_weight = patch.nearbyWeight;
  if (patch.premiumBoostWeight != null) payload.premium_boost_weight = patch.premiumBoostWeight;
  if (patch.businessBoostWeight != null) payload.business_boost_weight = patch.businessBoostWeight;
  if (patch.adBoostWeight != null) payload.ad_boost_weight = patch.adBoostWeight;
  if (patch.pointPromotionBoostWeight != null) {
    payload.point_promotion_boost_weight = patch.pointPromotionBoostWeight;
  }
  if (patch.bumpBoostWeight != null) payload.bump_boost_weight = patch.bumpBoostWeight;
  if (patch.exactRegionMatchWeight != null) payload.exact_region_match_weight = patch.exactRegionMatchWeight;
  if (patch.sameCityWeight != null) payload.same_city_weight = patch.sameCityWeight;
  if (patch.sameBarangayWeight != null) payload.same_barangay_weight = patch.sameBarangayWeight;
  if (patch.adminMemo != null) payload.admin_memo = patch.adminMemo;

  const { data, error } = await sb
    .from("exposure_score_policies")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapExposureScorePolicyRow(data as Record<string, unknown>);
}

export async function insertExposurePolicyLog(
  sb: SupabaseClient,
  input: {
    policyId: string;
    surface: ExposureSurface;
    actionType: ExposurePolicyLogActionType;
    adminId: string;
    adminNickname: string;
    note: string;
  }
): Promise<void> {
  const { error } = await sb.from("exposure_policy_logs").insert({
    policy_id: input.policyId,
    surface: input.surface,
    action_type: input.actionType,
    admin_id: input.adminId || null,
    admin_nickname: input.adminNickname,
    note: input.note,
  });
  if (error && !isMissingTable(error)) {
    throw new Error(error.message);
  }
}

export async function listExposurePolicyLogs(
  sb: SupabaseClient,
  limit = 100
): Promise<ExposurePolicyLog[]> {
  const { data, error } = await sb
    .from("exposure_policy_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapExposurePolicyLogRow(r as Record<string, unknown>));
}
