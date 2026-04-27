import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { resolveProfileLocationAddressOneLine } from "@/lib/profile/profile-location";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { buildAddressListDetailLine, buildTradePublicLine } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { AdminUser } from "@/lib/types/admin-user";
import type { AdminAuthProvider, MemberType } from "@/lib/types/admin-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  nickname: string | null;
  display_name: string | null;
  role: string | null;
  member_type: string | null;
  status: string | null;
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
  last_login_at: string | null;
  created_at: string | null;
};

type TestUserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  role: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  created_at: string | null;
};

type AuthListUser = {
  id?: string | null;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{
    id?: string | null;
    provider?: string | null;
    identity_data?: Record<string, unknown> | null;
    user_id?: string | null;
  }> | null;
};

type AuthAdminClient = SupabaseClient & {
  auth: SupabaseClient["auth"] & {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data?: { users?: AuthListUser[] };
        error?: { message?: string } | null;
      }>;
    };
  };
};

function mapProfileStatusToModeration(status: string | null | undefined): AdminUser["moderationStatus"] {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized || normalized === "active" || normalized === "sns_pending" || normalized === "verified_user") {
    return "normal";
  }
  if (normalized === "suspended" || normalized === "blocked") return "suspended";
  if (normalized === "deleted" || normalized === "banned") return "banned";
  if (normalized === "warned" || normalized === "warning") return "warned";
  return "normal";
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeProvider(input: unknown): AdminAuthProvider | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "custom:naver") return "naver";
  if (raw === "manual" || raw === "manual_admin" || raw === "manual_admin_backfill" || raw === "admin_manual") {
    return "manual";
  }
  if (
    raw === "google" ||
    raw === "kakao" ||
    raw === "naver" ||
    raw === "apple" ||
    raw === "facebook" ||
    raw === "email"
  ) {
    return raw;
  }
  return null;
}

function providerLabel(provider: AdminAuthProvider): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  if (provider === "naver") return "Naver";
  if (provider === "apple") return "Apple";
  if (provider === "facebook") return "Facebook";
  if (provider === "manual") return "Manual";
  if (provider === "email") return "Email";
  return "Unknown";
}

function primaryIdentity(user: AuthListUser | null | undefined) {
  const identities = Array.isArray(user?.identities) ? user?.identities ?? [] : [];
  return identities.find((identity) => normalizeProvider(identity.provider)) ?? identities[0] ?? null;
}

function resolveAuthProvider(input: {
  authUser?: AuthListUser | null;
  profile?: Pick<ProfileRow, "provider" | "auth_provider"> | null;
  testUser?: TestUserRow | null;
}): AdminAuthProvider {
  const identity = primaryIdentity(input.authUser);
  return (
    normalizeProvider(identity?.provider) ??
    normalizeProvider(input.authUser?.app_metadata?.provider) ??
    normalizeProvider(input.authUser?.user_metadata?.provider) ??
    normalizeProvider(input.authUser?.user_metadata?.auth_provider) ??
    normalizeProvider(input.profile?.provider) ??
    normalizeProvider(input.profile?.auth_provider) ??
    (input.testUser ? "manual" : null) ??
    (pickString(input.authUser?.email) || pickString(input.profile?.provider) ? "email" : "unknown")
  );
}

function resolveProviderUserId(authUser: AuthListUser | null | undefined): string | null {
  const identity = primaryIdentity(authUser);
  const data = identity?.identity_data;
  return (
    pickString(data?.sub) ??
    pickString(data?.provider_id) ??
    pickString(data?.id) ??
    pickString(identity?.id) ??
    pickString(identity?.user_id)
  );
}

function resolveIdentityEmail(authUser: AuthListUser | null | undefined): string | null {
  const identity = primaryIdentity(authUser);
  const data = identity?.identity_data;
  return pickString(data?.email);
}

function resolveLoginIdentifier(input: {
  provider: AdminAuthProvider;
  authUser?: AuthListUser | null;
  profile?: Pick<ProfileRow, "email" | "username"> | null;
  testUser?: TestUserRow | null;
  providerUserId?: string | null;
}): string {
  if (input.provider === "manual") {
    return (
      pickString(input.testUser?.username) ??
      pickString(input.profile?.username) ??
      pickString(input.authUser?.email) ??
      "이메일 없음"
    );
  }
  if (input.provider === "email") {
    return pickString(input.authUser?.email) ?? pickString(input.profile?.email) ?? pickString(input.profile?.username) ?? "이메일 없음";
  }
  return (
    pickString(input.authUser?.email) ??
    resolveIdentityEmail(input.authUser) ??
    pickString(input.profile?.email) ??
    input.providerUserId ??
    "이메일 없음"
  );
}

/** 목록 셀용: 수동 입력 멀티라인 중 첫 줄(보통 동네·ZIP) */
function firstLineOfMultiline(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const line = t.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return line ?? "";
}

const ADDRESS_SELECT =
  "id,user_id,label_type,nickname,recipient_name,phone_number,country_code,country_name,province,city_municipality,barangay,district,street_address,building_name,unit_floor_room,landmark,latitude,longitude,full_address,neighborhood_name,app_region_id,app_city_id,use_for_life,use_for_trade,use_for_delivery,is_default_master,is_default_life,is_default_trade,is_default_delivery,is_active,sort_order,created_at,updated_at";

/**
 * `profiles.region_*` 만으로는 사용자가 새 주소 관리에서 등록한 진짜 주소가 보이지 않는다.
 * `user_addresses` 의 활성 행을 사용자 ID 집합으로 한 번에 가져와 마스터·생활·거래·배달 우선순위로
 * 사용자별 대표 한 건만 추려서 반환한다.
 */
function pickAdminLocationAddressForUser(
  rows: UserAddressDTO[]
): UserAddressDTO | null {
  if (rows.length === 0) return null;
  const score = (a: UserAddressDTO): number =>
    (a.isDefaultMaster ? 1000 : 0) +
    (a.isDefaultLife ? 100 : 0) +
    (a.isDefaultTrade ? 10 : 0) +
    (a.isDefaultDelivery ? 1 : 0);
  let best = rows[0];
  let bestScore = score(best);
  for (let i = 1; i < rows.length; i += 1) {
    const cur = rows[i];
    const s = score(cur);
    if (s > bestScore) {
      best = cur;
      bestScore = s;
      continue;
    }
    if (s === bestScore) {
      const tCur = new Date(cur.updatedAt).getTime();
      const tBest = new Date(best.updatedAt).getTime();
      if (Number.isFinite(tCur) && tCur > (Number.isFinite(tBest) ? tBest : 0)) {
        best = cur;
      }
    }
  }
  return best;
}

/** 어드민 목록용 한 줄 주소 — 본문(동네·시·도로) + 가능한 경우 건물·동·호 꼬리. */
function locationLineFromUserAddress(dto: UserAddressDTO | null | undefined): string {
  if (!dto) return "";
  const main = buildTradePublicLine(dto).trim();
  if (!main || main === "주소 미입력") return "";
  const tail = buildAddressListDetailLine(dto, main);
  return tail ? `${main} · ${tail}` : main;
}

async function loadAdminAddressMap(
  sb: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserAddressDTO>> {
  const out = new Map<string, UserAddressDTO>();
  if (userIds.length === 0) return out;
  const { data: rows, error } = await sb
    .from("user_addresses")
    .select(ADDRESS_SELECT)
    .in("user_id", userIds)
    .eq("is_active", true);
  if (error || !Array.isArray(rows)) return out;
  const grouped = new Map<string, UserAddressDTO[]>();
  for (const row of rows) {
    const dto = rowToUserAddressDTO(row as Record<string, unknown>);
    if (!dto.userId) continue;
    const arr = grouped.get(dto.userId);
    if (arr) arr.push(dto);
    else grouped.set(dto.userId, [dto]);
  }
  for (const [uid, arr] of grouped.entries()) {
    const best = pickAdminLocationAddressForUser(arr);
    if (best) out.set(uid, best);
  }
  return out;
}

export async function GET(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
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

  const profileSelect =
    "id, email, username, nickname, display_name, role, member_type, status, member_status, region_code, region_name, address_street_line, address_detail, points, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";
  const fetchProfiles = async () =>
    supabase
      .from("profiles")
      .select(profileSelect)
      .order("created_at", { ascending: false });

  let { data: rows, error } = await fetchProfiles();

  /**
   * 관리자 목록 GET은 "조회 전용"으로 유지한다.
   * (목록 진입 경로에서 프로필 보정 write를 수행하지 않음)
   * profiles 누락 사용자는 auth-only 엔트리로 가시화해 운영자가 즉시 식별 가능하게 한다.
   */
  const serviceSb = supabase as AuthAdminClient;
  let authOnlyEntries: AuthListUser[] = [];
  let authUsers: AuthListUser[] = [];
  if (!error) {
    const existingIds = new Set<string>(
      ((rows ?? []) as ProfileRow[]).map((row) => row.id).filter((id) => typeof id === "string" && id.length > 0)
    );
    /**
     * 회원수는 `auth.users` 기준이므로 전체 페이지를 끝까지 로드한다.
     * (`perPage` 200 은 GoTrue 기본 상한, 안전 상한 5000 명까지 순회.)
     */
    try {
      const seen = new Set<string>();
      for (let page = 1; page <= 25; page += 1) {
        const result = await serviceSb.auth.admin.listUsers({ page, perPage: 200 });
        const batch = Array.isArray(result?.data?.users) ? result.data.users : [];
        if (batch.length === 0) break;
        let added = 0;
        for (const u of batch) {
          const id = String(u?.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          authUsers.push(u);
          added += 1;
        }
        if (added === 0) break;
        if (batch.length < 200) break;
      }
      authOnlyEntries = authUsers.filter((u) => {
        const id = String(u?.id ?? "").trim();
        return id.length > 0 && !existingIds.has(id);
      });
    } catch {
      // auth.admin 조회 실패 시 기존 profiles 결과를 그대로 사용.
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileIds = ((rows ?? []) as ProfileRow[]).map((row) => row.id).filter(Boolean);
  const ids = new Set(profileIds);

  /**
   * 신규 주소 관리(`user_addresses`) — 사용자가 실제로 등록한 주소를 한 번에 가져와 매핑.
   * 어드민 목록의 "지역" 셀은 우선 마스터/생활 기본 주소 한 줄을 사용한다.
   */
  const authOnlyIdSet = authOnlyEntries
    .map((u) => String(u?.id ?? "").trim())
    .filter(Boolean);
  const allUserIdsForAddress = Array.from(new Set([...profileIds, ...authOnlyIdSet]));
  const adminAddressMap = await loadAdminAddressMap(supabase, allUserIdsForAddress);

  /**
   * `test_users` 전체 스캔/전송 방지:
   * - profiles에 매칭되는 row만 우선 조회
   * - legacy(프로필 없는 테스트 유저)는 "최근 N개"만 보조로 붙인다(관리자 화면 목록에 충분).
   */
  const { data: matchedTestRows } =
    profileIds.length > 0
      ? await supabase
          .from("test_users")
          .select("id, username, display_name, role, contact_phone, contact_address, created_at")
          .in("id", profileIds)
      : { data: [] as TestUserRow[] };

  const legacyTestUsersQuery = supabase
    .from("test_users")
    .select("id, username, display_name, role, contact_phone, contact_address, created_at")
    .order("created_at", { ascending: false })
    .limit(250);
  const { data: recentTestRows } = await legacyTestUsersQuery;

  const testRowsById = new Map<string, TestUserRow>();
  for (const row of (matchedTestRows ?? []) as TestUserRow[]) {
    if (row?.id) testRowsById.set(row.id, row);
  }
  for (const row of (recentTestRows ?? []) as TestUserRow[]) {
    if (row?.id && !testRowsById.has(row.id)) testRowsById.set(row.id, row);
  }
  const testRows = Array.from(testRowsById.values());
  const testMap = new Map<string, TestUserRow>(
    ((testRows ?? []) as TestUserRow[]).map((row) => [row.id, row])
  );
  const authPairs: Array<[string, AuthListUser]> = [];
  for (const user of authUsers) {
    const id = String(user.id ?? "").trim();
    if (id) authPairs.push([id, user]);
  }
  const authMap = new Map<string, AuthListUser>(authPairs);

  const list: AdminUser[] = ((rows ?? []) as ProfileRow[]).map((r) => {
    const testUser = testMap.get(r.id);
    const authUser = authMap.get(r.id) ?? null;
    const authProvider = resolveAuthProvider({ authUser, profile: r, testUser });
    const providerUserId = resolveProviderUserId(authUser);
    const loginIdentifier = resolveLoginIdentifier({
      provider: authProvider,
      authUser,
      profile: r,
      testUser,
      providerUserId,
    });
    const memberType: MemberType =
      r.role === "admin" || r.role === "master" || r.role === "super_admin"
        ? "admin"
        : r.member_type === "premium" || r.role === "special"
          ? "premium"
          : "normal";
    const fromUserAddress = locationLineFromUserAddress(adminAddressMap.get(r.id));
    const fromProfile = resolveProfileLocationAddressOneLine({
      region_code: r.region_code,
      region_name: r.region_name,
      address_street_line: r.address_street_line,
      address_detail: r.address_detail,
    }).trim();
    const fromTestLine = firstLineOfMultiline(testUser?.contact_address);
    const locationLine =
      fromUserAddress ||
      fromProfile ||
      fromTestLine ||
      (r.region_name ?? "").trim() ||
      undefined;
    return {
      id: r.id,
      loginUsername: testUser?.username?.trim() || r.username?.trim() || undefined,
      loginIdentifier,
      nickname: r.nickname?.trim() || r.display_name?.trim() || testUser?.display_name?.trim() || r.username?.trim() || r.id,
      email: pickString(authUser?.email) ?? r.email ?? undefined,
      authProvider,
      providerLabel: providerLabel(authProvider),
      providerUserId: providerUserId ?? undefined,
      phone: r.phone?.trim() || testUser?.contact_phone?.trim() || undefined,
      memberType,
      profileRole: r.role ?? undefined,
      hasProfile: true,
      moderationStatus: mapProfileStatusToModeration(r.status),
      location: locationLine,
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
      lastSignInAt: authUser?.last_sign_in_at ?? r.last_login_at ?? undefined,
      lastActiveAt: authUser?.last_sign_in_at ?? r.last_login_at ?? undefined,
    };
  });

  const legacyTestUsers: AdminUser[] = ((testRows ?? []) as TestUserRow[])
    .filter((row) => !ids.has(row.id))
    .map((row) => {
      const role = String(row.role ?? "member").trim().toLowerCase();
      const memberType: MemberType =
        role === "admin" || role === "master" || role === "super_admin"
          ? "admin"
          : role === "special" || role === "premium"
            ? "premium"
            : "normal";
      const loc = firstLineOfMultiline(row.contact_address) || undefined;
      return {
        id: row.id,
        loginUsername: row.username?.trim() || undefined,
        loginIdentifier: row.username?.trim() || undefined,
        nickname: row.display_name?.trim() || row.username?.trim() || row.id,
        authProvider: "manual",
        providerLabel: "Manual",
        phone: row.contact_phone?.trim() || undefined,
        memberType,
        profileRole: row.role ?? undefined,
        hasProfile: false,
        moderationStatus: "normal",
        location: loc,
        phoneVerified: false,
        phoneVerifiedAt: undefined,
        verificationStatus: "unverified",
        memberStatus: "pending",
        verifiedMemberAt: undefined,
        productCount: 0,
        soldCount: 0,
        reviewCount: 0,
        reportCount: 0,
        chatCount: 0,
        joinedAt: row.created_at ?? new Date().toISOString(),
      };
    });

  /**
   * Supabase Auth 에는 있지만 `profiles` upsert가 막혀 행이 없는 회원 →
   * 관리자에게 "프로필 누락 상태" 그대로 노출한다.
   * 시각적으로 가입은 됐는데 동기화가 실패한 상태가 즉시 보이도록 hasProfile=false 로 둔다.
   */
  const profileLessAuthUsers: AdminUser[] = authOnlyEntries.map((u) => {
    const id = String(u.id ?? "").trim();
    const email = typeof u.email === "string" ? u.email.trim() : "";
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
    const provider =
      (typeof appMeta.provider === "string" && appMeta.provider.trim()) ||
      (typeof meta.provider === "string" && meta.provider.trim()) ||
      "email";
    const authProvider = normalizeProvider(provider) ?? "email";
    const providerUserId = resolveProviderUserId(u);
    const loginIdentifier = resolveLoginIdentifier({
      provider: authProvider,
      authUser: u,
      profile: null,
      testUser: null,
      providerUserId,
    });
    const nicknameMeta =
      (typeof meta.nickname === "string" && meta.nickname.trim()) ||
      (typeof meta.full_name === "string" && meta.full_name.trim()) ||
      (typeof meta.name === "string" && meta.name.trim()) ||
      "";
    const fallbackName =
      nicknameMeta || (email ? email.split("@")[0] : "") || id.slice(0, 8) || "user";
    return {
      id,
      loginUsername: undefined,
      loginIdentifier,
      nickname: fallbackName,
      email: email || undefined,
      authProvider,
      providerLabel: providerLabel(authProvider),
      providerUserId: providerUserId ?? undefined,
      memberType: "normal",
      profileRole: provider,
      hasProfile: false,
      moderationStatus: "warned",
      location: locationLineFromUserAddress(adminAddressMap.get(id)) || undefined,
      pointBalance: 0,
      phoneVerified: false,
      phoneVerifiedAt: undefined,
      verificationStatus: "unverified",
      memberStatus: "pending",
      verifiedMemberAt: undefined,
      productCount: 0,
      soldCount: 0,
      reviewCount: 0,
      reportCount: 0,
      chatCount: 0,
      joinedAt: typeof u.created_at === "string" && u.created_at ? u.created_at : new Date().toISOString(),
      lastSignInAt: typeof u.last_sign_in_at === "string" && u.last_sign_in_at ? u.last_sign_in_at : undefined,
      lastActiveAt: typeof u.last_sign_in_at === "string" && u.last_sign_in_at ? u.last_sign_in_at : undefined,
    };
  });

  /**
   * 최종 dedupe — `auth.users.id` 기준으로 1행만 유지한다.
   * profiles → legacyTestUsers → profileLessAuthUsers 순으로 우선순위가 높다(앞 항목이 보존).
   * (정상 케이스에서는 이미 분기에서 분리되지만 동일 UUID 충돌이 생겨도 안전하게 1행으로 수렴.)
   */
  const merged = [...list, ...legacyTestUsers, ...profileLessAuthUsers];
  const seenIds = new Set<string>();
  const dedupedUsers: AdminUser[] = [];
  for (const u of merged) {
    const id = String(u.id ?? "").trim();
    if (!id) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    dedupedUsers.push(u);
  }
  dedupedUsers.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());

  /**
   * provider 카운트는 `auth.identities` 기준 — auth user 의 primary identity provider 로 집계.
   * 매 회원 1행만 반영하므로 SNS 재로그인으로 카운트가 늘지 않는다.
   */
  const providerCounts = dedupedUsers.reduce<Record<string, number>>((acc, u) => {
    const key = String(u.authProvider ?? "unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    users: dedupedUsers,
    summary: {
      totalAuthUsers: authUsers.length,
      totalRows: dedupedUsers.length,
      withProfile: dedupedUsers.filter((u) => u.hasProfile === true).length,
      withoutProfile: dedupedUsers.filter((u) => u.hasProfile === false).length,
      providerCounts,
    },
  });
}
