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
  points: number | null;
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
};

function profileIsManualMember(row: Pick<ProfileRow, "auth_provider" | "provider">): boolean {
  const provider =
    normalizeAdminAuthProvider(row.auth_provider) ?? normalizeAdminAuthProvider(row.provider);
  return provider === "manual";
}

function normalizeRoleToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function resolveAdminAccountCategory(
  row: Pick<ProfileRow, "role" | "member_type">,
  opts?: { storeCount?: number; hasAdminMembership?: boolean },
): AdminAccountCategory {
  // Admin relationship = active admin_memberships only (profiles.role is presentation/history)
  void row.role;
  void row.member_type;
  if (opts?.hasAdminMembership === true) {
    return "admin";
  }
  // Store ownership SSOT = stores.owner_user_id (PHASE C/D) — never invent via profiles.role
  if ((opts?.storeCount ?? 0) > 0) {
    return "store_manager";
  }
  return "member";
}

function resolveMemberType(
  row: Pick<ProfileRow, "role" | "member_type">,
  accountCategory: AdminAccountCategory,
): MemberType {
  if (accountCategory === "admin") return "admin";
  const memberType = normalizeRoleToken(row.member_type);
  return memberType === "premium" || memberType === "special" ? "premium" : "normal";
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
  return String(raw ?? "")
    .trim()
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function parseAccountCategoryFilter(raw: string | null): AdminAccountCategory | null {
  const value = normalizeRoleToken(raw);
  return value === "member" || value === "store_manager" || value === "admin" ? value : null;
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
  hasAdminMembership: boolean;
}): AdminUserListItem {
  const { row: r, warnedUserIds, storeCount, hasApprovedStore, hasAdminMembership } = input;
  const authProvider = resolveAdminAuthProvider({
    profile: r,
    isManualTestUser: profileIsManualMember(r),
  });
  const displayEmail = resolveAdminDisplayEmail({
    profile: r,
    provider: authProvider,
  });
  const accountCategory = resolveAdminAccountCategory(r, {
    storeCount,
    hasAdminMembership,
  });
  const statusCategory = resolveAdminStatusCategory(r);
  const memberType = resolveMemberType(r, accountCategory);
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
    pointBalance: Number(r.points ?? 0),
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
    lastActiveAt: r.last_login_at ?? undefined,
    accountCategory,
    roleCategory: accountCategory,
    statusCategory,
    storeRelation: { count: storeCount, hasApproved: hasApprovedStore },
    hasAdminMembership,
  };
}

function fallbackAdminUserFromProfileRow(row: ProfileRow): AdminUserListItem {
  const accountCategory = resolveAdminAccountCategory(row, {});
  return {
    id: row.id,
    loginIdentifier: row.id,
    nickname: row.nickname?.trim() || row.display_name?.trim() || row.id,
    username: row.username?.trim() || null,
    authProvider: "unknown",
    providerLabel: adminAuthProviderLabel("unknown"),
    memberType: "normal",
    hasProfile: true,
    moderationStatus: "normal",
    phoneVerified: false,
    productCount: 0,
    soldCount: 0,
    reviewCount: 0,
    reportCount: 0,
    chatCount: 0,
    joinedAt: row.created_at ?? new Date().toISOString(),
    accountCategory,
    roleCategory: accountCategory,
    statusCategory: resolveAdminStatusCategory(row),
    storeRelation: { count: 0, hasApproved: false },
    hasAdminMembership: false,
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
  const statusFilter = parseStatusCategoryFilter(req.nextUrl.searchParams.get("status"));

  const profileSelect =
    "id, email, auth_login_email, provider_user_id, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_initial, dibay_id_changed_once, dibay_id_changed_at, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, points, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";
  const profileSelectLegacy =
    "id, email, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_initial, dibay_id_changed_once, dibay_id_changed_at, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, points, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";

  const fetchProfiles = async () => {
    let primary = supabase
      .from("profiles")
      .select(profileSelect, { count: "exact" })
      .order("created_at", { ascending: false });
    if (search) {
      const pattern = `%${search}%`;
      primary = primary.or(
        [
          `nickname.ilike.${pattern}`,
          `display_name.ilike.${pattern}`,
          `dibay_id.ilike.${pattern}`,
          `username.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `auth_login_email.ilike.${pattern}`,
        ].join(","),
      );
    }
    const primaryResult = await primary;
    if (!primaryResult.error) return primaryResult;
    const message = String(primaryResult.error.message ?? "").toLowerCase();
    if (
      message.includes("auth_login_email")
      || message.includes("provider_user_id")
      || message.includes("column")
    ) {
      let legacy = supabase
        .from("profiles")
        .select(profileSelectLegacy, { count: "exact" })
        .order("created_at", { ascending: false });
      if (search) {
        const pattern = `%${search}%`;
        legacy = legacy.or(
          [
            `nickname.ilike.${pattern}`,
            `display_name.ilike.${pattern}`,
            `dibay_id.ilike.${pattern}`,
            `username.ilike.${pattern}`,
            `email.ilike.${pattern}`,
          ].join(","),
        );
      }
      return legacy;
    }
    return primaryResult;
  };

  try {
    const { data: rows, error, count } = await fetchProfiles();

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
    const warnedUserIds = await loadWarnedUserIdSet(supabase, profileIds).catch(() => new Set<string>());

    const storeAgg = new Map<string, { count: number; hasApproved: boolean }>();
    const adminMemberIds = new Set<string>();
    if (profileIds.length > 0) {
      const { data: storeRows, error: storeErr } = await supabase
        .from("stores")
        .select("owner_user_id, approval_status")
        .in("owner_user_id", profileIds);
      if (!storeErr && Array.isArray(storeRows)) {
        for (const s of storeRows) {
          const oid = String((s as { owner_user_id?: string }).owner_user_id ?? "").trim();
          if (!oid) continue;
          const prev = storeAgg.get(oid) ?? { count: 0, hasApproved: false };
          prev.count += 1;
          if (String((s as { approval_status?: string }).approval_status ?? "") === "approved") {
            prev.hasApproved = true;
          }
          storeAgg.set(oid, prev);
        }
      }
      const { data: membershipRows, error: memErr } = await supabase
        .from("admin_memberships")
        .select("user_id")
        .in("user_id", profileIds)
        .eq("status", "active");
      if (!memErr && Array.isArray(membershipRows)) {
        for (const m of membershipRows) {
          const uid = String((m as { user_id?: string }).user_id ?? "").trim();
          if (uid) adminMemberIds.add(uid);
        }
      }
    }

    const list: AdminUserListItem[] = profileRows
      .map((r) => {
        try {
          const store = storeAgg.get(r.id) ?? { count: 0, hasApproved: false };
          const roleTok = String(r.role ?? "").trim().toLowerCase();
          const hasAdminMembership =
            adminMemberIds.has(r.id) ||
            roleTok === "admin" ||
            roleTok === "super_admin" ||
            roleTok === "master";
          return mapProfileRowToAdminUser({
            row: r,
            warnedUserIds,
            storeCount: store.count,
            hasApprovedStore: store.hasApproved,
            hasAdminMembership,
          });
        } catch {
          return fallbackAdminUserFromProfileRow(r);
        }
      })
      .filter((u) => (roleFilter ? u.accountCategory === roleFilter : true))
      .filter((u) => (statusFilter ? u.statusCategory === statusFilter : true));

    const seenIds = new Set<string>();
    const dedupedUsers: AdminUserListItem[] = [];
    for (const u of list) {
      const id = String(u.id ?? "").trim();
      if (!id) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      dedupedUsers.push(u);
    }
    dedupedUsers.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());

    /** provider 카운트는 profiles.provider/auth_provider 기준 — auth.users 전량 로드 없음. */
    const providerCounts = dedupedUsers.reduce<Record<string, number>>((acc, u) => {
      const key = String(u.authProvider ?? "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const accountCategoryCounts = dedupedUsers.reduce<Record<AdminAccountCategory, number>>(
      (acc, u) => {
        acc[u.accountCategory] += 1;
        return acc;
      },
      { member: 0, store_manager: 0, admin: 0 },
    );

    console.info("[admin-users] list summary", {
      profilesFetchOk: true,
      profilesRowCount: profileRows.length,
      dedupedCount: dedupedUsers.length,
      searchApplied: Boolean(search),
      roleFilter,
      statusFilter,
      accountCategoryCounts,
    });

    return NextResponse.json({
      users: dedupedUsers,
      summary: {
        profilesFetchOk: true,
        profilesRowCount: profileRows.length,
        dedupedCount: dedupedUsers.length,
        totalProfiles: count ?? profileRows.length,
        search,
        roleFilter,
        statusFilter,
        source: "profiles_stores_admin_membership",
        totalAuthUsers: 0,
        totalRows: dedupedUsers.length,
        withProfile: dedupedUsers.filter((u) => u.hasProfile === true).length,
        withoutProfile: dedupedUsers.filter((u) => u.hasProfile === false).length,
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
