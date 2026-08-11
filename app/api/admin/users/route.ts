import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadWarnedUserIdSet } from "@/lib/admin/admin-user-server";
import { mapProfileStatusToModeration } from "@/lib/admin-users/moderation-status";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  adminAuthProviderLabel,
  normalizeAdminAuthProvider,
  resolveAdminAuthProvider,
} from "@/lib/admin-users/resolve-admin-auth-provider";
import { resolveAdminDisplayEmail } from "@/lib/admin-users/resolve-admin-user-display";
import type { AdminAccountCategory, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";
import type { MemberType } from "@/lib/types/admin-user";
import {
  adminMembershipRoleFromRow,
  parseAdminMemberRelationFilter,
  resolveAdminMemberRoleBadges,
  type AdminMemberRoleBadge,
} from "@/lib/admin-users/member-role-badges";
import {
  ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT,
  adminMemberRelationFilterPlan,
  adminMemberSearchFilterOps,
  adminMemberStatusFilterOps,
  applyProfileFilterOps,
  isAdminMemberUuidSearch,
  normalizeAdminMemberSearchToken,
  parseAdminMemberListPage,
  uniqueAdminMemberIds,
  type ProfileFilterOp,
} from "@/lib/admin-users/admin-member-list-query";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  dibay_id: string | null;
  dibay_id_locked: boolean | null;
  dibay_id_auto_assigned: boolean | null;
  dibay_id_initial: string | null;
  dibay_id_changed_once: boolean | null;
  dibay_id_changed_at: string | null;
  onboarding_status: string | null;
  onboarding_completed_at: string | null;
  nickname: string | null;
  display_name: string | null;
  role: string | null;
  member_type: string | null;
  status: string | null;
  deleted_at: string | null;
  region_code: string | null;
  region_name: string | null;
  address_street_line: string | null;
  address_detail: string | null;
  phone: string | null;
  phone_verified: boolean | null;
  phone_verified_at: string | null;
  phone_verification_status: string | null;
  member_status: string | null;
  verified_member_at: string | null;
  provider: string | null;
  auth_provider: string | null;
  auth_login_email: string | null;
  provider_user_id: string | null;
  last_login_at: string | null;
  created_at: string | null;
};

type AdminUserListItem = AdminUser & {
  accountCategory: AdminAccountCategory;
  roleCategory: AdminAccountCategory;
  statusCategory: AdminUserStatusCategory;
  roleBadges: AdminMemberRoleBadge[];
};

function profileIsManualMember(row: Pick<ProfileRow, "auth_provider" | "provider">): boolean {
  const provider =
    normalizeAdminAuthProvider(row.auth_provider) ?? normalizeAdminAuthProvider(row.provider);
  return provider === "manual";
}

function normalizeRoleToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function resolveMemberType(row: Pick<ProfileRow, "member_type">): MemberType {
  const memberType = normalizeRoleToken(row.member_type);
  if (memberType === "premium" || memberType === "special") return "premium";
  return "normal";
}

function visualAccountCategory(badges: readonly AdminMemberRoleBadge[]): AdminAccountCategory {
  if (badges.includes("admin") || badges.includes("super_admin")) return "admin";
  if (badges.includes("store_owner")) return "store_manager";
  return "member";
}

function resolveAdminStatusCategory(
  row: Pick<ProfileRow, "status" | "deleted_at" | "member_status" | "phone_verified" | "phone_verification_status">,
): AdminUserStatusCategory {
  const status = normalizeRoleToken(row.status);
  const memberStatus = normalizeRoleToken(row.member_status);
  const phoneStatus = normalizeRoleToken(row.phone_verification_status);
  if (row.deleted_at || status === "deleted" || status === "withdrawn" || status === "deactivated") {
    return "deleted";
  }
  if (
    status === "suspended" ||
    status === "banned" ||
    memberStatus === "suspended" ||
    memberStatus === "banned"
  ) {
    return "suspended";
  }
  if (
    row.phone_verified !== true ||
    memberStatus === "pending" ||
    memberStatus === "review" ||
    phoneStatus === "pending" ||
    phoneStatus === "rejected"
  ) {
    return "needs_review";
  }
  return "active";
}

function sanitizeAdminUserSearch(raw: string | null): string {
  return normalizeAdminMemberSearchToken(
    String(raw ?? "")
      .trim()
      .replace(/[%,()]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 80),
  );
}

function parseAccountCategoryFilter(raw: string | null): AdminAccountCategory | null {
  const relation = parseAdminMemberRelationFilter(raw);
  if (relation === "plain") return "member";
  if (relation === "store_owner") return "store_manager";
  if (relation === "admin") return "admin";
  return null;
}

function parseStatusCategoryFilter(raw: string | null): AdminUserStatusCategory | null {
  const value = normalizeRoleToken(raw);
  return value === "active" || value === "needs_review" || value === "suspended" || value === "deleted"
    ? value
    : null;
}

function mapProfileRowToAdminUser(input: {
  row: ProfileRow;
  warnedUserIds: Set<string>;
  storeCount: number;
  hasApprovedStore: boolean;
  stores: Array<{
    id: string;
    name: string;
    approvalStatus: string | null;
    isVisible: boolean | null;
    connectedAt: string | null;
  }>;
  hasAdminMembership: boolean;
  adminMembershipRole: "admin" | "super_admin" | null;
}): AdminUserListItem {
  const { row: r, warnedUserIds, storeCount, hasApprovedStore, stores, hasAdminMembership, adminMembershipRole } = input;
  const authProvider = resolveAdminAuthProvider({
    profile: r,
    isManualTestUser: profileIsManualMember(r),
  });
  const displayEmail = resolveAdminDisplayEmail({
    profile: r,
    provider: authProvider,
  });
  const roleBadges = resolveAdminMemberRoleBadges({
    hasStoreOwnership: storeCount > 0,
    adminMembershipRole,
  });
  const accountCategory = visualAccountCategory(roleBadges);
  const statusCategory = resolveAdminStatusCategory(r);
  const memberType = resolveMemberType(r);
  const dibayId = r.dibay_id?.trim() || null;
  const username = r.username?.trim() || null;
  const nickname =
    labelFromDisplayAndUsername(
      (r.display_name ?? r.nickname ?? "").trim(),
      (r.username ?? "").trim(),
    ) ||
    r.display_name?.trim() ||
    r.nickname?.trim() ||
    username ||
    r.id;
  const publicId = dibayId || username;
  const email = displayEmail ?? r.auth_login_email?.trim() ?? r.email?.trim() ?? undefined;

  return {
    id: r.id,
    loginUsername: undefined,
    loginIdentifier: email ?? (publicId ? `@${publicId}` : r.id),
    username,
    dibay_id: dibayId,
    dibay_id_locked: r.dibay_id_locked === true,
    dibay_id_auto_assigned: r.dibay_id_auto_assigned === true,
    dibay_id_initial: r.dibay_id_initial?.trim() || null,
    dibay_id_changed_once: r.dibay_id_changed_once === true,
    dibay_id_changed_at: r.dibay_id_changed_at ?? null,
    onboarding_status: r.onboarding_status?.trim() || null,
    onboarding_completed_at: r.onboarding_completed_at ?? null,
    displayName: r.display_name?.trim() || r.nickname?.trim() || null,
    nickname,
    email,
    authProvider,
    providerLabel: adminAuthProviderLabel(authProvider),
    providerUserId: r.provider_user_id?.trim() || undefined,
    phone: r.phone?.trim() || undefined,
    memberType,
    profileRole: r.role ?? undefined,
    hasProfile: true,
    moderationStatus: mapProfileStatusToModeration(r.status, r.deleted_at, warnedUserIds.has(r.id)),
    location: r.region_name?.trim() || undefined,
    phoneVerified: r.phone_verified === true,
    phoneVerifiedAt: r.phone_verified_at ?? undefined,
    verificationStatus: r.phone_verification_status ?? undefined,
    memberStatus: r.member_status ?? undefined,
    verifiedMemberAt: r.verified_member_at ?? undefined,
    productCount: 0,
    soldCount: 0,
    reviewCount: 0,
    reportCount: 0,
    chatCount: 0,
    joinedAt: r.created_at ?? new Date().toISOString(),
    lastSignInAt: r.last_login_at ?? undefined,
    accountCategory,
    roleCategory: accountCategory,
    statusCategory,
    roleBadges,
    storeRelation: { count: storeCount, hasApproved: hasApprovedStore, stores },
    hasAdminMembership,
    isSuperAdmin: adminMembershipRole === "super_admin",
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ error: supabaseEnv.error }, { status: 500 });
  }
  if (!supabaseEnv.serviceKey) {
    return NextResponse.json(
      {
        error: "SUPABASE_SERVICE_ROLE_KEY가 없어 관리자 회원 목록을 조회할 수 없습니다.",
        code: "supabase_service_unconfigured",
      },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } });
  const search = sanitizeAdminUserSearch(req.nextUrl.searchParams.get("search"));
  const roleFilter = parseAccountCategoryFilter(req.nextUrl.searchParams.get("role"));
  const relationFilter = parseAdminMemberRelationFilter(req.nextUrl.searchParams.get("role"));
  const statusFilter = parseStatusCategoryFilter(req.nextUrl.searchParams.get("status"));
  const { page, pageSize, from, to } = parseAdminMemberListPage(
    req.nextUrl.searchParams.get("page"),
    req.nextUrl.searchParams.get("pageSize"),
  );
  const uuidSearch = Boolean(search) && isAdminMemberUuidSearch(search);
  const statusOps = statusFilter ? adminMemberStatusFilterOps(statusFilter) : [];

  const profileSelect =
    "id, email, auth_login_email, provider_user_id, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_initial, dibay_id_changed_once, dibay_id_changed_at, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";
  const profileSelectLegacy =
    "id, email, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_initial, dibay_id_changed_once, dibay_id_changed_at, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";

  const isMissingProfileColumn = (message: string) => {
    const lower = message.toLowerCase();
    return (
      lower.includes("auth_login_email")
      || lower.includes("provider_user_id")
      || lower.includes("column")
    );
  };

  try {
    const [storeOwnerResult, adminIdResult, storeNameResult] = await Promise.all([
      supabase.from("stores").select("owner_user_id"),
      supabase.from("admin_memberships").select("user_id").eq("status", "active"),
      search && !uuidSearch
        ? supabase
            .from("stores")
            .select("owner_user_id")
            .ilike("store_name", `%${search}%`)
            .limit(ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT)
        : Promise.resolve({ data: [] as Array<{ owner_user_id?: string }>, error: null }),
    ]);

    if (storeOwnerResult.error || adminIdResult.error) {
      const message = storeOwnerResult.error?.message ?? adminIdResult.error?.message ?? "relation_lookup_failed";
      console.warn("[admin-users] relation id lookup failed", { message });
      return NextResponse.json(
        {
          error: message,
          code: "admin_users_relation_lookup_failed",
          summary: { profilesFetchOk: false, profilesRowCount: 0, dedupedCount: 0 },
        },
        { status: 500 },
      );
    }

    const ownerIds = uniqueAdminMemberIds(
      (storeOwnerResult.data ?? []).map((r) => String((r as { owner_user_id?: string }).owner_user_id ?? "")),
    );
    const adminIds = uniqueAdminMemberIds(
      (adminIdResult.data ?? []).map((r) => String((r as { user_id?: string }).user_id ?? "")),
    );
    const storeNameOwnerIds = uniqueAdminMemberIds(
      (storeNameResult.data ?? []).map((r) => String((r as { owner_user_id?: string }).owner_user_id ?? "")),
    );

    const listOps = (includeAuthLoginEmail: boolean, relation: typeof relationFilter) => {
      const plan = adminMemberRelationFilterPlan(relation, ownerIds, adminIds);
      return {
        empty: plan.empty,
        ops: [
          ...adminMemberSearchFilterOps(search, {
            includeAuthLoginEmail,
            extraIds: uuidSearch ? [] : storeNameOwnerIds,
          }),
          ...statusOps,
          ...plan.ops,
        ] as ProfileFilterOp[],
      };
    };

    const runPage = async (select: string, includeAuthLoginEmail: boolean) => {
      const planned = listOps(includeAuthLoginEmail, relationFilter);
      if (planned.empty) {
        return { data: [] as ProfileRow[], error: null as { message?: string } | null, count: 0 };
      }
      const query = applyProfileFilterOps(
        supabase
          .from("profiles")
          .select(select, { count: "exact" })
          .order("created_at", { ascending: false }),
        planned.ops,
      );
      return query.range(from, to);
    };

    const runCount = async (includeAuthLoginEmail: boolean, relation: typeof relationFilter) => {
      const planned = listOps(includeAuthLoginEmail, relation);
      if (planned.empty) return { count: 0 as number | null, error: null as string | null };
      const resolved = await applyProfileFilterOps(
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        planned.ops,
      );
      if (resolved.error) return { count: null, error: resolved.error.message ?? "count_failed" };
      return { count: resolved.count ?? 0, error: null };
    };

    let includeAuthLoginEmail = true;
    let pageResult = await runPage(profileSelect, true);
    if (pageResult.error && isMissingProfileColumn(String(pageResult.error.message ?? ""))) {
      includeAuthLoginEmail = false;
      pageResult = await runPage(profileSelectLegacy, false);
    }

    const { data: rows, error, count } = pageResult;

    if (error) {
      console.warn("[admin-users] profiles fetch failed", { message: error.message });
      return NextResponse.json(
        {
          error: error.message,
          summary: {
            profilesFetchOk: false,
            profilesRowCount: 0,
            dedupedCount: 0,
          },
        },
        { status: 500 },
      );
    }

    const profileRows = (rows ?? []) as ProfileRow[];
    const profileIds = profileRows.map((row) => row.id).filter(Boolean);
    const [warnedUserIds, plainCount, storeOwnerCount, adminRelationCount, allCount] = await Promise.all([
      loadWarnedUserIdSet(supabase, profileIds).catch(() => new Set<string>()),
      runCount(includeAuthLoginEmail, "plain"),
      runCount(includeAuthLoginEmail, "store_owner"),
      runCount(includeAuthLoginEmail, "admin"),
      runCount(includeAuthLoginEmail, "all"),
    ]);

    const storeAgg = new Map<
      string,
      {
        count: number;
        hasApproved: boolean;
        stores: Array<{
          id: string;
          name: string;
          approvalStatus: string | null;
          isVisible: boolean | null;
          connectedAt: string | null;
        }>;
      }
    >();
    const adminMemberIds = new Set<string>();
    const adminMembershipRoleByUser = new Map<string, "admin" | "super_admin">();
    if (profileIds.length > 0) {
      const { data: storeRows, error: storeErr } = await supabase
        .from("stores")
        .select("id, owner_user_id, store_name, approval_status, is_visible, created_at")
        .in("owner_user_id", profileIds);
      if (!storeErr && Array.isArray(storeRows)) {
        for (const s of storeRows) {
          const oid = String((s as { owner_user_id?: string }).owner_user_id ?? "").trim();
          if (!oid) continue;
          const store = s as {
            id?: string;
            store_name?: string | null;
            approval_status?: string | null;
            is_visible?: boolean | null;
            created_at?: string | null;
          };
          const prev = storeAgg.get(oid) ?? { count: 0, hasApproved: false, stores: [] };
          prev.count += 1;
          if (String(store.approval_status ?? "") === "approved") {
            prev.hasApproved = true;
          }
          prev.stores.push({
            id: String(store.id ?? ""),
            name: String(store.store_name ?? "").trim(),
            approvalStatus: store.approval_status ?? null,
            isVisible: store.is_visible ?? null,
            connectedAt: store.created_at ?? null,
          });
          storeAgg.set(oid, prev);
        }
      }
      const { data: membershipRows, error: memErr } = await supabase
        .from("admin_memberships")
        .select("user_id, role")
        .in("user_id", profileIds)
        .eq("status", "active");
      if (!memErr && Array.isArray(membershipRows)) {
        for (const m of membershipRows) {
          const uid = String((m as { user_id?: string }).user_id ?? "").trim();
          const membershipRole = adminMembershipRoleFromRow(
            (m as { role?: string }).role,
          );
          if (!uid || !membershipRole) continue;
          adminMemberIds.add(uid);
          adminMembershipRoleByUser.set(uid, membershipRole);
        }
      }
    }

    const list: AdminUserListItem[] = profileRows.map((r) => {
      const store = storeAgg.get(r.id) ?? { count: 0, hasApproved: false, stores: [] };
      const hasAdminMembership = adminMemberIds.has(r.id);
      return mapProfileRowToAdminUser({
        row: r,
        warnedUserIds,
        storeCount: store.count,
        hasApprovedStore: store.hasApproved,
        stores: store.stores,
        hasAdminMembership,
        adminMembershipRole: adminMembershipRoleByUser.get(r.id) ?? null,
      });
    });

    const seenIds = new Set<string>();
    const pageUsers: AdminUserListItem[] = [];
    for (const u of list) {
      const id = String(u.id ?? "").trim();
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      pageUsers.push(u);
    }

    const countsOk =
      plainCount.error == null
      && storeOwnerCount.error == null
      && adminRelationCount.error == null
      && allCount.error == null;
    const accountCategoryCounts: Record<AdminAccountCategory, number | null> = {
      member: countsOk ? plainCount.count : null,
      store_manager: countsOk ? storeOwnerCount.count : null,
      admin: countsOk ? adminRelationCount.count : null,
    };
    const totalRows = count ?? pageUsers.length;
    const providerCounts = pageUsers.reduce<Record<string, number>>((acc, u) => {
      const key = String(u.authProvider ?? "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    console.info("[admin-users] list summary", {
      profilesFetchOk: true,
      profilesRowCount: profileRows.length,
      page,
      pageSize,
      totalRows,
      searchApplied: Boolean(search),
      uuidSearch,
      roleFilter,
      statusFilter,
      countsOk,
    });

    return NextResponse.json({
      users: pageUsers,
      summary: {
        profilesFetchOk: true,
        profilesRowCount: profileRows.length,
        dedupedCount: pageUsers.length,
        totalProfiles: allCount.count,
        search,
        roleFilter,
        statusFilter,
        page,
        pageSize,
        source: "profiles_stores_admin_membership",
        totalAuthUsers: 0,
        totalRows,
        countsOk,
        withProfile: pageUsers.filter((u) => u.hasProfile === true).length,
        withoutProfile: pageUsers.filter((u) => u.hasProfile === false).length,
        providerCounts,
        accountCategoryCounts,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "admin_users_list_failed";
    return NextResponse.json(
      {
        error: "회원 목록을 구성하는 중 오류가 발생했습니다.",
        code: "admin_users_list_failed",
        detail: message,
      },
      { status: 500 },
    );
  }
}
