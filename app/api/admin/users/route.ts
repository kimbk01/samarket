import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { resolveProfileLocationAddressOneLine } from "@/lib/profile/profile-location";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import type { AdminUser } from "@/lib/types/admin-user";
import type { MemberType } from "@/lib/types/admin-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  nickname: string | null;
  role: string | null;
  member_type: string | null;
  status: string | null;
  region_code: string | null;
  region_name: string | null;
  address_street_line: string | null;
  address_detail: string | null;
  points: number | null;
  phone_verified: boolean | null;
  phone_verification_status: string | null;
  created_at: string | null;
};

type TestUserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  role: string | null;
  contact_address: string | null;
  created_at: string | null;
};

type AuthListUser = {
  id?: string | null;
  email?: string | null;
  created_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
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

/** 목록 셀용: 수동 입력 멀티라인 중 첫 줄(보통 동네·ZIP) */
function firstLineOfMultiline(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const line = t.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return line ?? "";
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
    "id, email, username, nickname, role, member_type, status, region_code, region_name, address_street_line, address_detail, points, phone_verified, phone_verification_status, created_at";
  const fetchProfiles = async () =>
    supabase
      .from("profiles")
      .select(profileSelect)
      .order("created_at", { ascending: false });

  let { data: rows, error } = await fetchProfiles();

  /**
   * OAuth 첫 로그인 직후 `profiles` 누락이 남아도 관리자 목록에서 보이도록
   * 최근 Auth 사용자 프로필을 한 번 보정하고,
   * 보정마저 실패한 사용자는 "auth-only" 임시 엔트리로 항상 노출한다.
   * (회원 가입은 됐지만 `profiles` 가 비는 상태를 관리자에게 가시화)
   */
  const serviceSb = supabase as AuthAdminClient;
  let authOnlyEntries: AuthListUser[] = [];
  if (!error) {
    const existingIds = new Set<string>(
      ((rows ?? []) as ProfileRow[]).map((row) => row.id).filter((id) => typeof id === "string" && id.length > 0)
    );
    try {
      const authUsersResult = await serviceSb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const authUsers = Array.isArray(authUsersResult?.data?.users)
        ? authUsersResult.data.users
        : [];
      const missingAuthUsers = authUsers
        .filter((u) => {
          const id = String(u?.id ?? "").trim();
          return id.length > 0 && !existingIds.has(id);
        })
        .slice(0, 50);

      for (const authUser of missingAuthUsers) {
        const id = String(authUser.id ?? "").trim();
        if (!id) continue;
        try {
          await ensureProfileForUserId(supabase, id);
        } catch {
          // 한 명의 보정 실패는 전체 목록 노출을 막지 않는다.
        }
      }

      if (missingAuthUsers.length > 0) {
        const refetched = await fetchProfiles();
        rows = refetched.data;
        error = refetched.error;
      }

      /**
       * `ensureProfileForUserId` 가 성공했는지 다시 검사.
       * 여전히 `profiles` 에 없는 auth.users 는 auth-only 엔트리로 표시 →
       * "Supabase Auth 에는 있지만 profiles 누락" 상태가 관리자 화면에서 즉시 보인다.
       */
      const refreshedIds = new Set<string>(
        ((rows ?? []) as ProfileRow[]).map((row) => row.id).filter(Boolean)
      );
      authOnlyEntries = missingAuthUsers.filter((u) => {
        const id = String(u?.id ?? "").trim();
        return id.length > 0 && !refreshedIds.has(id);
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
   * `test_users` 전체 스캔/전송 방지:
   * - profiles에 매칭되는 row만 우선 조회
   * - legacy(프로필 없는 테스트 유저)는 "최근 N개"만 보조로 붙인다(관리자 화면 목록에 충분).
   */
  const { data: matchedTestRows } =
    profileIds.length > 0
      ? await supabase
          .from("test_users")
          .select("id, username, display_name, role, contact_address, created_at")
          .in("id", profileIds)
      : { data: [] as TestUserRow[] };

  let legacyTestUsersQuery = supabase
    .from("test_users")
    .select("id, username, display_name, role, contact_address, created_at")
    .order("created_at", { ascending: false })
    .limit(250);
  if (profileIds.length > 0) {
    /** `profiles` 와 id 가 겹치는 행은 `matchedTestRows` 로 이미 조회 — 최근 250 스캔의 대역·중복 병합 낭비 감소 */
    legacyTestUsersQuery = legacyTestUsersQuery.not("id", "in", `(${profileIds.join(",")})`);
  }
  const { data: recentTestRows } = await legacyTestUsersQuery;

  const testRows = [...((matchedTestRows ?? []) as TestUserRow[]), ...((recentTestRows ?? []) as TestUserRow[])];
  const testMap = new Map<string, TestUserRow>(
    ((testRows ?? []) as TestUserRow[]).map((row) => [row.id, row])
  );

  const list: AdminUser[] = ((rows ?? []) as ProfileRow[]).map((r) => {
    const testUser = testMap.get(r.id);
    const memberType: MemberType =
      r.role === "admin" || r.role === "master" || r.role === "super_admin"
        ? "admin"
        : r.member_type === "premium" || r.role === "special"
          ? "premium"
          : "normal";
    const fromProfile = resolveProfileLocationAddressOneLine({
      region_code: r.region_code,
      region_name: r.region_name,
      address_street_line: r.address_street_line,
      address_detail: r.address_detail,
    }).trim();
    const fromTestLine = firstLineOfMultiline(testUser?.contact_address);
    const locationLine =
      fromProfile ||
      fromTestLine ||
      (r.region_name ?? "").trim() ||
      undefined;
    return {
      id: r.id,
      loginUsername: testUser?.username?.trim() || r.username?.trim() || undefined,
      nickname: r.nickname?.trim() || testUser?.display_name?.trim() || r.username?.trim() || r.id,
      email: r.email ?? undefined,
      memberType,
      profileRole: r.role ?? undefined,
      hasProfile: true,
      moderationStatus: mapProfileStatusToModeration(r.status),
      location: locationLine,
      pointBalance: Number(r.points ?? 0),
      phoneVerified: r.phone_verified === true,
      verificationStatus: r.phone_verification_status ?? undefined,
      productCount: 0,
      soldCount: 0,
      reviewCount: 0,
      reportCount: 0,
      chatCount: 0,
      joinedAt: r.created_at ?? new Date().toISOString(),
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
        nickname: row.display_name?.trim() || row.username?.trim() || row.id,
        memberType,
        profileRole: row.role ?? undefined,
        hasProfile: false,
        moderationStatus: "normal",
        location: loc,
        phoneVerified: false,
        verificationStatus: "unverified",
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
      nickname: fallbackName,
      email: email || undefined,
      memberType: "normal",
      profileRole: provider,
      hasProfile: false,
      moderationStatus: "warned",
      location: undefined,
      pointBalance: 0,
      phoneVerified: false,
      verificationStatus: "unverified",
      productCount: 0,
      soldCount: 0,
      reviewCount: 0,
      reportCount: 0,
      chatCount: 0,
      joinedAt: typeof u.created_at === "string" && u.created_at ? u.created_at : new Date().toISOString(),
    };
  });

  return NextResponse.json({
    users: [...list, ...legacyTestUsers, ...profileLessAuthUsers].sort(
      (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()
    ),
  });
}
