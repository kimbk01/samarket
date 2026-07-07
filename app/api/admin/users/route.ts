import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadWarnedUserIdSet } from "@/lib/admin/admin-user-server";
import { mapProfileStatusToModeration } from "@/lib/admin-users/moderation-status";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { resolveProfileLocationAddressOneLine } from "@/lib/profile/profile-location";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { buildAddressListDetailLine, buildTradePublicLine } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  adminAuthProviderLabel,
  resolveAdminAuthProvider,
  type AdminAuthListUser,
} from "@/lib/admin-users/resolve-admin-auth-provider";
import {
  resolveAdminDisplayEmail,
  resolveAdminLoginIdentifier,
  resolveAdminProviderUserId,
  type AdminLinkedIdentity,
} from "@/lib/admin-users/resolve-admin-user-display";
import {
  buildAuthUserMap,
  linkedProvidersFromIdentities,
  loadAllAuthAdminUsers,
  loadLinkedIdentitiesMapChunked,
  loadTestUsersByIdsChunked,
  resolveProfileLessAdminNickname,
} from "@/lib/admin-users/admin-users-list-server";
import { chunkIds, CHAT_ROOM_ID_IN_CHUNK_SIZE } from "@/lib/chats/chat-list-limits";
import type { AdminUser } from "@/lib/types/admin-user";
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

type TestUserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  role: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  created_at: string | null;
};

type AuthListUser = AdminAuthListUser;

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
  const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return out;

  const chunks = chunkIds(uniqueIds, CHAT_ROOM_ID_IN_CHUNK_SIZE);
  const results = await Promise.all(
    chunks.map((chunk) =>
      sb.from("user_addresses").select(ADDRESS_SELECT).in("user_id", chunk).eq("is_active", true),
    ),
  );

  const grouped = new Map<string, UserAddressDTO[]>();
  for (const { data: rows, error } of results) {
    if (error || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const dto = rowToUserAddressDTO(row as Record<string, unknown>);
      if (!dto.userId) continue;
      const arr = grouped.get(dto.userId);
      if (arr) arr.push(dto);
      else grouped.set(dto.userId, [dto]);
    }
  }
  for (const [uid, arr] of grouped.entries()) {
    const best = pickAdminLocationAddressForUser(arr);
    if (best) out.set(uid, best);
  }
  return out;
}

function mapProfileRowToAdminUser(input: {
  row: ProfileRow;
  testUser?: TestUserRow;
  authUser: AuthListUser | null;
  linkedIdentities: AdminLinkedIdentity[] | null;
  adminAddressMap: Map<string, UserAddressDTO>;
  warnedUserIds: Set<string>;
}): AdminUser {
  const { row: r, testUser, authUser, linkedIdentities, adminAddressMap, warnedUserIds } = input;
  const authProvider = resolveAdminAuthProvider({
    authUser,
    profile: r,
    isManualTestUser: Boolean(testUser),
    linkedProviders: linkedProvidersFromIdentities(linkedIdentities ?? undefined),
  });
  const providerUserId = resolveAdminProviderUserId({
    provider: authProvider,
    authUser,
    profile: r,
    linkedIdentities,
  });
  const loginIdentifier = resolveAdminLoginIdentifier({
    provider: authProvider,
    authUser,
    profile: r,
    testUser,
    linkedIdentities,
    providerUserId,
  });
  const displayEmail = resolveAdminDisplayEmail({
    authUser,
    profile: r,
    linkedIdentities,
    provider: authProvider,
  });
  const memberType: MemberType =
    r.role === "admin" || r.role === "master" || r.role === "super_admin"
      ? "admin"
      : r.member_type === "premium"
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
    username: r.username?.trim() || null,
    dibay_id: r.dibay_id?.trim() || null,
    dibay_id_locked: r.dibay_id_locked === true,
    onboarding_status: r.onboarding_status?.trim() || null,
    onboarding_completed_at: r.onboarding_completed_at ?? null,
    displayName: r.display_name?.trim() || r.nickname?.trim() || null,
    nickname:
      labelFromDisplayAndUsername(
        (r.display_name ?? r.nickname ?? testUser?.display_name ?? "").trim(),
        (r.username ?? "").trim(),
      ) ||
      r.display_name?.trim() ||
      r.nickname?.trim() ||
      testUser?.display_name?.trim() ||
      r.username?.trim() ||
      r.id,
    email: displayEmail,
    authProvider,
    providerLabel: adminAuthProviderLabel(authProvider),
    providerUserId: providerUserId ?? undefined,
    phone: r.phone?.trim() || testUser?.contact_phone?.trim() || undefined,
    memberType,
    profileRole: r.role ?? undefined,
    hasProfile: true,
    moderationStatus: mapProfileStatusToModeration(r.status, r.deleted_at, warnedUserIds.has(r.id)),
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
}

function fallbackAdminUserFromProfileRow(row: ProfileRow): AdminUser {
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
  };
}

export async function GET(_req: NextRequest) {
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

  const profileSelect =
    "id, email, auth_login_email, provider_user_id, username, dibay_id, dibay_id_locked, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, points, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";
  const profileSelectLegacy =
    "id, email, username, dibay_id, dibay_id_locked, onboarding_status, onboarding_completed_at, nickname, display_name, role, member_type, status, deleted_at, member_status, region_code, region_name, address_street_line, address_detail, points, phone, phone_verified, phone_verified_at, phone_verification_status, verified_member_at, provider, auth_provider, last_login_at, created_at";

  const fetchProfiles = async () => {
    const primary = await supabase
      .from("profiles")
      .select(profileSelect)
      .order("created_at", { ascending: false });
    if (!primary.error) return primary;
    const message = String(primary.error.message ?? "").toLowerCase();
    if (
      message.includes("auth_login_email")
      || message.includes("provider_user_id")
      || message.includes("column")
    ) {
      return supabase
        .from("profiles")
        .select(profileSelectLegacy)
        .order("created_at", { ascending: false });
    }
    return primary;
  };

  try {
  const serviceSb = supabase as AuthAdminClient;
  const [{ data: rows, error }, authUsers] = await Promise.all([
    fetchProfiles(),
    loadAllAuthAdminUsers(serviceSb).catch(() => [] as AuthListUser[]),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileRows = (rows ?? []) as ProfileRow[];
  const existingIds = new Set<string>(
    profileRows.map((row) => row.id).filter((id) => typeof id === "string" && id.length > 0),
  );
  const authOnlyEntries = authUsers.filter((u) => {
    const id = String(u?.id ?? "").trim();
    return id.length > 0 && !existingIds.has(id);
  });

  const profileIds = profileRows.map((row) => row.id).filter(Boolean);
  const authOnlyIdSet = authOnlyEntries
    .map((u) => String(u?.id ?? "").trim())
    .filter(Boolean);
  const allUserIdsForAddress = Array.from(new Set([...profileIds, ...authOnlyIdSet]));
  const allUserIdsForProviders = Array.from(new Set([...profileIds, ...authOnlyIdSet]));

  const [adminAddressMap, linkedIdentitiesMap, warnedUserIds, matchedTestRows] =
    await Promise.all([
      loadAdminAddressMap(supabase, allUserIdsForAddress),
      loadLinkedIdentitiesMapChunked(supabase, allUserIdsForProviders).catch(
        () => new Map<string, AdminLinkedIdentity[]>(),
      ),
      loadWarnedUserIdSet(supabase, profileIds).catch(() => new Set<string>()),
      loadTestUsersByIdsChunked(supabase, profileIds).catch(() => [] as TestUserRow[]),
    ]);

  const testRowsById = new Map<string, TestUserRow>();
  for (const row of (matchedTestRows ?? []) as TestUserRow[]) {
    if (row?.id) testRowsById.set(row.id, row);
  }
  const testMap = testRowsById;
  const authMap = buildAuthUserMap(authUsers);

  const list: AdminUser[] = profileRows.map((r) => {
    try {
      return mapProfileRowToAdminUser({
        row: r,
        testUser: testMap.get(r.id),
        authUser: authMap.get(r.id) ?? null,
        linkedIdentities: linkedIdentitiesMap.get(r.id) ?? null,
        adminAddressMap,
        warnedUserIds,
      });
    } catch {
      return fallbackAdminUserFromProfileRow(r);
    }
  });

  /**
   * Supabase Auth 에는 있지만 `profiles` upsert가 막혀 행이 없는 회원 →
   * 관리자에게 "프로필 누락 상태" 그대로 노출한다.
   * 시각적으로 가입은 됐는데 동기화가 실패한 상태가 즉시 보이도록 hasProfile=false 로 둔다.
   */
  const profileLessAuthUsers: AdminUser[] = authOnlyEntries.flatMap((u) => {
    try {
      const id = String(u.id ?? "").trim();
      if (!id) return [];
      const email = typeof u.email === "string" ? u.email.trim() : "";
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const linkedIdentities = linkedIdentitiesMap.get(id) ?? null;
      const authProvider = resolveAdminAuthProvider({
        authUser: u,
        profile: null,
        linkedProviders: linkedProvidersFromIdentities(linkedIdentities ?? undefined),
      });
      const providerUserId = resolveAdminProviderUserId({
        provider: authProvider,
        authUser: u,
        profile: null,
        linkedIdentities,
      });
      const loginIdentifier = resolveAdminLoginIdentifier({
        provider: authProvider,
        authUser: u,
        profile: null,
        testUser: null,
        linkedIdentities,
        providerUserId,
      });
      const displayEmail = resolveAdminDisplayEmail({
        authUser: u,
        profile: null,
        linkedIdentities,
        provider: authProvider,
      });
      const nicknameMeta =
        (typeof meta.nickname === "string" && meta.nickname.trim()) ||
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        "";
      const fallbackName = resolveProfileLessAdminNickname({
        userMetadata: meta,
        authEmail: email,
        loginIdentifier,
        userId: id,
      });
      return [
        {
          id,
          loginUsername: undefined,
          loginIdentifier,
          username: null,
          displayName: nicknameMeta || null,
          nickname: fallbackName,
          email: displayEmail,
          authProvider,
          providerLabel: adminAuthProviderLabel(authProvider),
          providerUserId: providerUserId ?? undefined,
          memberType: "normal" as MemberType,
          profileRole:
            (typeof meta.provider === "string" && meta.provider.trim()) ||
            authProvider,
          hasProfile: false,
          moderationStatus: "warned" as const,
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
        },
      ];
    } catch {
      return [];
    }
  });

  /**
   * 최종 dedupe — `auth.users.id` 기준으로 1행만 유지한다.
   * profiles → profileLessAuthUsers 순으로 우선순위가 높다(앞 항목이 보존).
   * test_users-only(프로필 없음)는 기본 목록에서 제외한다.
   */
  const merged = [...list, ...profileLessAuthUsers];
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
