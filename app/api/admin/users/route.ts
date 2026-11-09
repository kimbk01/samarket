import { NextRequest, NextResponse } from "next/server";
import { loadMasterPublicCityLabelsByUserIds } from "@/lib/addresses/master-public-city-labels.server";
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
import {
  resolveAdminDisplayEmail,
  type AdminLinkedIdentity,
} from "@/lib/admin-users/resolve-admin-user-display";
import { loadLinkedIdentitiesMapChunked } from "@/lib/admin-users/admin-users-list-server";
import {
  adminMemberLoginAccountCopyValue,
  manualLoginIdFromAuthEmail,
  resolveAdminMemberLoginAccount,
} from "@/lib/admin-users/member-sns-account";
import type { AdminAccountCategory, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";
import type { MemberType } from "@/lib/types/admin-user";
import {
  adminMembershipRoleFromRow,
  resolveAdminMemberRoleBadges,
  type AdminMemberRoleBadge,
} from "@/lib/admin-users/member-role-badges";
import {
  ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT,
  adminMemberJoinedRangeOps,
  adminMemberOriginFilterOps,
  adminMemberPrivilegeFilterPlan,
  adminMemberSearchFilterOps,
  adminMemberStatusFilterOps,
  adminMemberStoreFilterPlan,
  adminMemberVerificationFilterOps,
  applyProfileFilterOps,
  isAdminMemberUuidSearch,
  normalizeAdminMemberSearchToken,
  parseAdminMemberListStandardPage,
  uniqueAdminMemberIds,
  type AdminMemberOriginFilter,
  type AdminMemberPrivilegeFilter,
  type AdminMemberStoreFilter,
  type AdminMemberVerifyFilter,
  type ProfileFilterOp,
} from "@/lib/admin-users/admin-member-list-query";
import { resolveDisplayName } from "@/lib/users/user-label";
import { resolvePhoneVerificationDisplayStatus } from "@/lib/profile/admin-phone-verification-sync";
import { adminServerText } from "@/lib/i18n/admin-server-language";

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
  phone_verification_method?: string | null;
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

const SNS_ADMIN_PROVIDERS = new Set(["google", "kakao", "apple", "naver", "facebook"]);

/**
 * 관리자 생성 회원 — provider 가 manual 계열이거나, SNS 가 아니면서 로그인 주소가 `@manual.local`.
 * (2026-10-02 이전 프로필 보정 코드가 provider 를 email 로 덮어쓴 25명 포함 — 설계안 ⑤)
 */
function profileIsManualMember(
  row: Pick<ProfileRow, "auth_provider" | "provider" | "auth_login_email">,
): boolean {
  const provider =
    normalizeAdminAuthProvider(row.auth_provider) ?? normalizeAdminAuthProvider(row.provider);
  if (provider === "manual") return true;
  if (provider && SNS_ADMIN_PROVIDERS.has(provider)) return false;
  return manualLoginIdFromAuthEmail(row.auth_login_email) !== null;
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
  if (row.deleted_at || status === "deleted" || status === "withdrawn" || status === "deactivated") {
    return "deleted";
  }
  // BLOCKED ≠ SUSPENDED — blocked/banned never map to suspended category.
  if (status === "blocked" || status === "banned") {
    return "blocked";
  }
  if (status === "suspended" || memberStatus === "suspended") {
    return "suspended";
  }
  // Account state is independent of verification (OD-02 / R2).
  if (memberStatus === "pending" || memberStatus === "review") {
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

function parseStatusCategoryFilter(raw: string | null): AdminUserStatusCategory | null {
  const value = normalizeRoleToken(raw);
  return value === "active"
    || value === "needs_review"
    || value === "suspended"
    || value === "blocked"
    || value === "deleted"
    ? value
    : null;
}

function parseVerifyFilter(raw: string | null): AdminMemberVerifyFilter | null {
  const value = normalizeRoleToken(raw);
  return value === "verified" || value === "unverified" ? value : null;
}

function parseStoreFilter(raw: string | null): AdminMemberStoreFilter | null {
  const value = normalizeRoleToken(raw);
  return value === "has_store" || value === "no_store" ? value : null;
}

function parsePrivilegeFilter(raw: string | null): AdminMemberPrivilegeFilter | null {
  const value = normalizeRoleToken(raw);
  return value === "admin" || value === "member" ? value : null;
}

function parseOriginFilter(raw: string | null): AdminMemberOriginFilter | null {
  const value = normalizeRoleToken(raw);
  return value === "email" ||
    value === "manual" ||
    value === "kakao" ||
    value === "google" ||
    value === "apple" ||
    value === "other"
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
    slug?: string | null;
    approvalStatus: string | null;
    isVisible: boolean | null;
    connectedAt: string | null;
  }>;
  hasAdminMembership: boolean;
  adminMembershipRole: "admin" | "super_admin" | null;
  linkedIdentities: readonly AdminLinkedIdentity[] | null;
}): AdminUserListItem {
  const { row: r, warnedUserIds, storeCount, hasApprovedStore, stores, hasAdminMembership, adminMembershipRole } = input;
  const linkedIdentities = input.linkedIdentities ?? null;
  // SNS 계정 기준 = user_auth_identities (설계안 ③) — profiles.provider 가 email 로 잘못 남은 회원도 바르게 분류
  const authProvider = resolveAdminAuthProvider({
    profile: r,
    isManualTestUser: profileIsManualMember(r),
    linkedProviders: (linkedIdentities ?? []).map((row) => row.provider),
  });
  // 연락 이메일 = 실제 연락 가능한 주소만. 내부 로그인 주소(native·@manual.local)로 되돌아가지 않는다 (설계안 ①)
  const displayEmail = resolveAdminDisplayEmail({
    profile: r,
    linkedIdentities,
    provider: authProvider,
  });
  const loginAccount = resolveAdminMemberLoginAccount({
    provider: authProvider,
    linkedIdentities,
    profileProviderUserId: r.provider_user_id,
    authLoginEmail: r.auth_login_email,
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
  const nickname = r.nickname?.trim() || "";
  /** 공개 이름 SSOT = nickname (앱 게시판·거래와 동일) — display_name 은 사본 (감사 #4) */
  const displayName = resolveDisplayName({
    display_name: nickname || r.display_name,
    nickname: r.nickname,
    email: displayEmail,
    username,
  });
  const email = displayEmail ?? undefined;

  return {
    id: r.id,
    loginUsername: username ?? undefined,
    loginIdentifier: adminMemberLoginAccountCopyValue(loginAccount) ?? email ?? undefined,
    loginAccount,
    username,
    dibay_id: dibayId,
    dibay_id_locked: r.dibay_id_locked === true,
    dibay_id_auto_assigned: r.dibay_id_auto_assigned === true,
    dibay_id_initial: r.dibay_id_initial?.trim() || null,
    dibay_id_changed_once: r.dibay_id_changed_once === true,
    dibay_id_changed_at: r.dibay_id_changed_at ?? null,
    onboarding_status: r.onboarding_status?.trim() || null,
    onboarding_completed_at: r.onboarding_completed_at ?? null,
    displayName,
    nickname: nickname || displayName,
    email,
    authProvider,
    providerLabel: adminAuthProviderLabel(authProvider),
    providerUserId: loginAccount?.providerUserId ?? undefined,
    phone: r.phone?.trim() || undefined,
    memberType,
    profileRole: r.role ?? undefined,
    hasProfile: true,
    moderationStatus: mapProfileStatusToModeration(r.status, r.deleted_at, warnedUserIds.has(r.id)),
    location: r.region_name?.trim() || undefined,
    /** 목록 필터·정렬도 앱 게이트와 같은 판정 (감사 #8) */
    phoneVerified: resolvePhoneVerificationDisplayStatus(r) === "verified",
    phoneVerifiedAt: r.phone_verified_at ?? undefined,
    /** 앱 게이트(hasVerifiedPhone)와 같은 판정 (감사 #8) */
    verificationStatus: resolvePhoneVerificationDisplayStatus(r),
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
        error: await adminServerText("admin_api_users_list_service_key_missing"),
        code: "supabase_service_unconfigured",
      },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } });
  const search = sanitizeAdminUserSearch(req.nextUrl.searchParams.get("search"));
  const statusFilter = parseStatusCategoryFilter(req.nextUrl.searchParams.get("status"));
  const verifyFilter = parseVerifyFilter(req.nextUrl.searchParams.get("verify"));
  const storeFilter = parseStoreFilter(req.nextUrl.searchParams.get("store"));
  const privilegeFilter = parsePrivilegeFilter(req.nextUrl.searchParams.get("privilege"));
  const originFilter = parseOriginFilter(req.nextUrl.searchParams.get("origin"));
  const joinedFromRaw = String(req.nextUrl.searchParams.get("joinedFrom") ?? "").trim();
  const joinedToRaw = String(req.nextUrl.searchParams.get("joinedTo") ?? "").trim();
  const joinedFrom = /^\d{4}-\d{2}-\d{2}$/.test(joinedFromRaw) ? joinedFromRaw : "";
  const joinedTo = /^\d{4}-\d{2}-\d{2}$/.test(joinedToRaw) ? joinedToRaw : "";
  // 가입일 = PHT 날짜 (대시보드 「신규 가입」과 같은 경계)
  const joinedRangeOps = adminMemberJoinedRangeOps(joinedFrom, joinedTo);
  const sortRaw = String(req.nextUrl.searchParams.get("sort") ?? "created_at_desc").trim().toLowerCase();
  const sortColumn =
    sortRaw === "last_login_asc" || sortRaw === "last_login_desc" ? "last_login_at" : "created_at";
  const sortAscending = sortRaw === "created_at_asc" || sortRaw === "last_login_asc";
  const { page, pageSize, from, to } = parseAdminMemberListStandardPage(
    req.nextUrl.searchParams.get("page"),
    req.nextUrl.searchParams.get("pageSize"),
  );
  const uuidSearch = Boolean(search) && isAdminMemberUuidSearch(search);

  const profileSelect =
    "id, email, auth_login_email, provider_user_id, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_initial, dibay_id_changed_once, dibay_id_changed_at, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, phone, phone_verified, phone_verified_at, phone_verification_status, phone_verification_method, verified_member_at, provider, auth_provider, last_login_at, created_at";
  const profileSelectLegacy =
    "id, email, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_initial, dibay_id_changed_once, dibay_id_changed_at, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, phone, phone_verified, phone_verified_at, phone_verification_status, phone_verification_method, verified_member_at, provider, auth_provider, last_login_at, created_at";

  const isMissingProfileColumn = (message: string) => {
    const lower = message.toLowerCase();
    return (
      lower.includes("auth_login_email")
      || lower.includes("provider_user_id")
      || lower.includes("column")
    );
  };

  try {
    const [storeOwnerResult, adminIdResult, storeNameResult, storeIdResult] = await Promise.all([
      supabase.from("stores").select("owner_user_id"),
      supabase.from("admin_memberships").select("user_id").eq("status", "active"),
      search && !uuidSearch
        ? supabase
            .from("stores")
            .select("owner_user_id")
            .ilike("store_name", `%${search}%`)
            .limit(ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT)
        : Promise.resolve({ data: [] as Array<{ owner_user_id?: string }>, error: null }),
      search
        ? supabase
            .from("stores")
            .select("owner_user_id")
            .eq("id", search)
            .limit(5)
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
    const storeIdOwnerIds = uniqueAdminMemberIds(
      (storeIdResult.data ?? []).map((r) => String((r as { owner_user_id?: string }).owner_user_id ?? "")),
    );
    // SNS 고유번호(카카오 회원번호·Apple sub·Google id)·SNS 계정 이메일 검색 (설계안 ③)
    let identitySearchIds: string[] = [];
    if (search && !uuidSearch) {
      const { data: identityRows } = await supabase
        .from("user_auth_identities")
        .select("user_id")
        .or(`provider_user_id.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT);
      identitySearchIds = uniqueAdminMemberIds(
        (identityRows ?? []).map((r) => String((r as { user_id?: string }).user_id ?? "")),
      );
    }
    const storeSearchOwnerIds = uniqueAdminMemberIds([
      ...storeNameOwnerIds,
      ...storeIdOwnerIds,
      ...identitySearchIds,
    ]);

    const listOps = (
      includeAuthLoginEmail: boolean,
      opts?: {
        store?: AdminMemberStoreFilter | null;
        privilege?: AdminMemberPrivilegeFilter | null;
        status?: typeof statusFilter;
        verify?: typeof verifyFilter;
        origin?: typeof originFilter;
      },
    ) => {
      const storePlan = adminMemberStoreFilterPlan(opts?.store ?? storeFilter, ownerIds);
      const privPlan = adminMemberPrivilegeFilterPlan(opts?.privilege ?? privilegeFilter, adminIds);
      const status = opts?.status === undefined ? statusFilter : opts.status;
      const verify = opts?.verify === undefined ? verifyFilter : opts.verify;
      const origin = opts?.origin === undefined ? originFilter : opts.origin;
      return {
        empty: storePlan.empty || privPlan.empty,
        ops: [
          ...adminMemberSearchFilterOps(search, {
            includeAuthLoginEmail,
            // UUID may be profile id OR store id — union store owners when matched.
            extraIds: storeSearchOwnerIds,
          }),
          ...(status ? adminMemberStatusFilterOps(status) : []),
          ...adminMemberVerificationFilterOps(verify),
          ...storePlan.ops,
          ...privPlan.ops,
          ...adminMemberOriginFilterOps(origin),
        ] as ProfileFilterOp[],
      };
    };

    const runPage = async (select: string, includeAuthLoginEmail: boolean) => {
      const planned = listOps(includeAuthLoginEmail);
      if (planned.empty) {
        return { data: [] as ProfileRow[], error: null as { message?: string } | null, count: 0 };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Postgrest filter chain
      const query: any = applyProfileFilterOps(
        supabase
          .from("profiles")
          .select(select, { count: "exact" })
          .order(sortColumn, { ascending: sortAscending, nullsFirst: false }),
        [...planned.ops, ...joinedRangeOps],
      );
      return query.range(from, to);
    };

    const runCount = async (
      includeAuthLoginEmail: boolean,
      opts?: {
        store?: AdminMemberStoreFilter | null;
        privilege?: AdminMemberPrivilegeFilter | null;
        status?: typeof statusFilter;
        verify?: typeof verifyFilter;
        origin?: typeof originFilter;
      },
    ) => {
      const planned = listOps(includeAuthLoginEmail, opts);
      if (planned.empty) return { count: 0 as number | null, error: null as string | null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Postgrest filter chain
      const countQuery: any = applyProfileFilterOps(
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        [...planned.ops, ...joinedRangeOps],
      );
      const resolved = await countQuery;
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
    const linkedIdentitiesMap = await loadLinkedIdentitiesMapChunked(supabase, profileIds).catch(
      () => new Map<string, AdminLinkedIdentity[]>(),
    );
    /** 회원 지역 = 대표 주소 시/군 (주소 SSOT · profiles.region_name 미사용, 2026-11-09) */
    const masterCityByUser = await loadMasterPublicCityLabelsByUserIds(supabase, profileIds).catch(
      () => new Map<string, string | null>(),
    );

    const runStatusCount = async (
      includeAuthLoginEmail: boolean,
      status: NonNullable<typeof statusFilter>,
    ) => {
      const ops = [
        ...adminMemberSearchFilterOps(search, {
          includeAuthLoginEmail,
          extraIds: storeSearchOwnerIds,
        }),
        ...adminMemberStatusFilterOps(status),
      ] as ProfileFilterOp[];
      const resolved = await applyProfileFilterOps(
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        ops,
      );
      const { count, error } = await resolved;
      return { count: count as number | null, error: error?.message ?? null };
    };

    const [
      warnedUserIds,
      plainCount,
      storeOwnerCount,
      adminRelationCount,
      allCount,
      activeStatusCount,
      needsReviewStatusCount,
      suspendedStatusCount,
      blockedStatusCount,
    ] = await Promise.all([
      loadWarnedUserIdSet(supabase, profileIds).catch(() => new Set<string>()),
      runCount(includeAuthLoginEmail, { store: "no_store", privilege: "member", status: null, verify: null, origin: null }),
      runCount(includeAuthLoginEmail, { store: "has_store", privilege: null, status: null, verify: null, origin: null }),
      runCount(includeAuthLoginEmail, { privilege: "admin", store: null, status: null, verify: null, origin: null }),
      runCount(includeAuthLoginEmail, { store: null, privilege: null, status: null, verify: null, origin: null }),
      runStatusCount(includeAuthLoginEmail, "active"),
      runStatusCount(includeAuthLoginEmail, "needs_review"),
      runStatusCount(includeAuthLoginEmail, "suspended"),
      runStatusCount(includeAuthLoginEmail, "blocked"),
    ]);

    const storeAgg = new Map<
      string,
      {
        count: number;
        hasApproved: boolean;
        stores: Array<{
          id: string;
          name: string;
          slug?: string | null;
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
        .select("id, owner_user_id, store_name, slug, approval_status, is_visible, created_at")
        .in("owner_user_id", profileIds);
      if (!storeErr && Array.isArray(storeRows)) {
        for (const s of storeRows) {
          const oid = String((s as { owner_user_id?: string }).owner_user_id ?? "").trim();
          if (!oid) continue;
          const store = s as {
            id?: string;
            store_name?: string | null;
            slug?: string | null;
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
            slug: String(store.slug ?? "").trim() || null,
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
        row: { ...r, region_name: masterCityByUser.get(r.id) ?? null },
        warnedUserIds,
        storeCount: store.count,
        hasApprovedStore: store.hasApproved,
        stores: store.stores,
        hasAdminMembership,
        adminMembershipRole: adminMembershipRoleByUser.get(r.id) ?? null,
        linkedIdentities: linkedIdentitiesMap.get(r.id) ?? null,
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
      && allCount.error == null
      && activeStatusCount.error == null
      && needsReviewStatusCount.error == null
      && suspendedStatusCount.error == null
      && blockedStatusCount.error == null;
    const accountCategoryCounts: Record<AdminAccountCategory, number | null> = {
      member: countsOk ? plainCount.count : null,
      store_manager: countsOk ? storeOwnerCount.count : null,
      admin: countsOk ? adminRelationCount.count : null,
    };
    const statusCategoryCounts: Record<AdminUserStatusCategory, number | null> = {
      active: countsOk ? activeStatusCount.count : null,
      needs_review: countsOk ? needsReviewStatusCount.count : null,
      suspended: countsOk ? suspendedStatusCount.count : null,
      blocked: countsOk ? blockedStatusCount.count : null,
      deleted: null,
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
      statusFilter,
      verifyFilter,
      storeFilter,
      privilegeFilter,
      originFilter,
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
        statusFilter,
        verifyFilter,
        storeFilter,
        privilegeFilter,
        originFilter,
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
        statusCategoryCounts,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "admin_users_list_failed";
    return NextResponse.json(
      {
        error: await adminServerText("admin_api_users_list_build_failed"),
        code: "admin_users_list_failed",
        detail: message,
      },
      { status: 500 },
    );
  }
}
