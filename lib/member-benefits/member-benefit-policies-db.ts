import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MemberBenefitLog,
  MemberBenefitLogActionType,
  MemberBenefitPolicy,
  MemberBenefitSummary,
  MemberType,
  ProfileFrameType,
} from "@/lib/types/member-benefit";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mapMemberBenefitPolicyRow(row: Record<string, unknown>): MemberBenefitPolicy {
  return {
    id: String(row.id ?? ""),
    memberType: String(row.member_type ?? "normal") as MemberType,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    isActive: Boolean(row.is_active ?? true),
    profileFrameType: String(row.profile_frame_type ?? "dark") as ProfileFrameType,
    badgeLabel: String(row.badge_label ?? ""),
    homePriorityBoost: Math.floor(num(row.home_priority_boost)),
    searchPriorityBoost: Math.floor(num(row.search_priority_boost)),
    shopFeaturedPriorityBoost: Math.floor(num(row.shop_featured_priority_boost)),
    pointRewardBonusRate: num(row.point_reward_bonus_rate),
    adDiscountRate: num(row.ad_discount_rate),
    productLimitPerMonth:
      row.product_limit_per_month != null ? Math.floor(num(row.product_limit_per_month)) : undefined,
    canOpenBusinessProfile: Boolean(row.can_open_business_profile ?? true),
    canAccessPremiumPromotion: Boolean(row.can_access_premium_promotion ?? false),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    adminMemo: row.admin_memo != null ? String(row.admin_memo) : undefined,
  };
}

function mapMemberBenefitLogRow(row: Record<string, unknown>): MemberBenefitLog {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    userNickname: String(row.user_nickname ?? ""),
    memberType: String(row.member_type ?? "normal") as MemberType,
    policyId: String(row.policy_id ?? ""),
    actionType: String(row.action_type ?? "update") as MemberBenefitLogActionType,
    note: String(row.note ?? ""),
    actorType: (String(row.actor_type ?? "admin") as MemberBenefitLog["actorType"]),
    actorId: String(row.actor_id ?? ""),
    actorNickname: String(row.actor_nickname ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist");
}

export async function listMemberBenefitPolicies(sb: SupabaseClient): Promise<MemberBenefitPolicy[]> {
  const { data, error } = await sb
    .from("member_benefit_policies")
    .select("*")
    .order("member_type", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapMemberBenefitPolicyRow(r as Record<string, unknown>));
}

export async function getMemberBenefitPolicyByIdFromDb(
  sb: SupabaseClient,
  id: string
): Promise<MemberBenefitPolicy | null> {
  const { data, error } = await sb.from("member_benefit_policies").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapMemberBenefitPolicyRow(data as Record<string, unknown>);
}

export async function insertMemberBenefitPolicy(
  sb: SupabaseClient,
  input: Omit<MemberBenefitPolicy, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<MemberBenefitPolicy> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("member_benefit_policies")
    .insert({
      id: input.id,
      member_type: input.memberType,
      title: input.title,
      description: input.description,
      is_active: input.isActive,
      profile_frame_type: input.profileFrameType,
      badge_label: input.badgeLabel,
      home_priority_boost: input.homePriorityBoost,
      search_priority_boost: input.searchPriorityBoost,
      shop_featured_priority_boost: input.shopFeaturedPriorityBoost,
      point_reward_bonus_rate: input.pointRewardBonusRate,
      ad_discount_rate: input.adDiscountRate,
      product_limit_per_month: input.productLimitPerMonth ?? null,
      can_open_business_profile: input.canOpenBusinessProfile,
      can_access_premium_promotion: input.canAccessPremiumPromotion,
      admin_memo: input.adminMemo ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapMemberBenefitPolicyRow(data as Record<string, unknown>);
}

export async function updateMemberBenefitPolicy(
  sb: SupabaseClient,
  id: string,
  patch: Partial<MemberBenefitPolicy>
): Promise<MemberBenefitPolicy> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title != null) payload.title = patch.title;
  if (patch.description != null) payload.description = patch.description;
  if (patch.isActive != null) payload.is_active = patch.isActive;
  if (patch.profileFrameType != null) payload.profile_frame_type = patch.profileFrameType;
  if (patch.badgeLabel != null) payload.badge_label = patch.badgeLabel;
  if (patch.homePriorityBoost != null) payload.home_priority_boost = patch.homePriorityBoost;
  if (patch.searchPriorityBoost != null) payload.search_priority_boost = patch.searchPriorityBoost;
  if (patch.shopFeaturedPriorityBoost != null) {
    payload.shop_featured_priority_boost = patch.shopFeaturedPriorityBoost;
  }
  if (patch.pointRewardBonusRate != null) payload.point_reward_bonus_rate = patch.pointRewardBonusRate;
  if (patch.adDiscountRate != null) payload.ad_discount_rate = patch.adDiscountRate;
  if (patch.productLimitPerMonth != null) payload.product_limit_per_month = patch.productLimitPerMonth;
  if (patch.canOpenBusinessProfile != null) payload.can_open_business_profile = patch.canOpenBusinessProfile;
  if (patch.canAccessPremiumPromotion != null) {
    payload.can_access_premium_promotion = patch.canAccessPremiumPromotion;
  }
  if (patch.adminMemo != null) payload.admin_memo = patch.adminMemo;

  const { data, error } = await sb
    .from("member_benefit_policies")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapMemberBenefitPolicyRow(data as Record<string, unknown>);
}

export async function listMemberBenefitLogs(
  sb: SupabaseClient,
  policyId?: string,
  limit = 100
): Promise<MemberBenefitLog[]> {
  let q = sb.from("member_benefit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (policyId?.trim()) q = q.eq("policy_id", policyId.trim());
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapMemberBenefitLogRow(r as Record<string, unknown>));
}

export async function insertMemberBenefitLog(
  sb: SupabaseClient,
  input: Omit<MemberBenefitLog, "id" | "createdAt">
): Promise<void> {
  const { error } = await sb.from("member_benefit_logs").insert({
    user_id: input.userId || null,
    user_nickname: input.userNickname,
    member_type: input.memberType,
    policy_id: input.policyId || null,
    action_type: input.actionType,
    note: input.note,
    actor_type: input.actorType,
    actor_id: input.actorId || null,
    actor_nickname: input.actorNickname,
  });
  if (error && !isMissingTable(error)) throw new Error(error.message);
}

export async function getMemberBenefitSummariesFromDb(
  sb: SupabaseClient
): Promise<MemberBenefitSummary[]> {
  const [policies, logs] = await Promise.all([
    listMemberBenefitPolicies(sb),
    listMemberBenefitLogs(sb, undefined, 500),
  ]);
  const types: MemberType[] = ["normal", "premium", "admin"];
  return types.map((memberType) => {
    const active = policies.filter((p) => p.memberType === memberType && p.isActive);
    const typeLogs = logs.filter((l) => l.memberType === memberType);
    const latest = active.length
      ? active.reduce(
          (best, p) => (!best || p.updatedAt > best ? p.updatedAt : best),
          null as string | null
        )
      : null;
    return {
      memberType,
      activePolicyCount: active.length,
      totalUsers: 0,
      totalAppliedLogs: typeLogs.length,
      latestUpdatedAt: latest,
    };
  });
}
