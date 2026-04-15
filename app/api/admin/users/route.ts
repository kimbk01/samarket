import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { resolveProfileLocationAddressOneLine } from "@/lib/profile/profile-location";
import type { AdminUser } from "@/lib/types/admin-user";
import type { MemberType } from "@/lib/types/admin-user";

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

  const anon = createClient(supabaseEnv.url, supabaseEnv.anonKey);

  const supabase = supabaseEnv.serviceKey
    ? createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } })
    : anon;

  const { data: rows, error } = await (supabase as any)
    .from("profiles")
    .select(
      "id, email, username, nickname, role, member_type, status, region_code, region_name, address_street_line, address_detail, points, phone_verified, phone_verification_status, created_at"
    )
    .order("created_at", { ascending: false });

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
      ? await (supabase as any)
          .from("test_users")
          .select("id, username, display_name, role, contact_address, created_at")
          .in("id", profileIds)
      : { data: [] as TestUserRow[] };

  const { data: recentTestRows } = await (supabase as any)
    .from("test_users")
    .select("id, username, display_name, role, contact_address, created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  const testRows = [...((matchedTestRows ?? []) as TestUserRow[]), ...((recentTestRows ?? []) as TestUserRow[])];
  const testMap = new Map<string, TestUserRow>(
    ((testRows ?? []) as TestUserRow[]).map((row) => [row.id, row])
  );

  const list: AdminUser[] = ((rows ?? []) as ProfileRow[]).map((r) => {
    const testUser = testMap.get(r.id);
    const memberType: MemberType =
      r.role === "admin" || r.role === "master"
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
      moderationStatus: r.status === "active" ? "normal" : "warned",
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
        role === "admin" || role === "master" ? "admin" : role === "special" || role === "premium" ? "premium" : "normal";
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

  return NextResponse.json({
    users: [...list, ...legacyTestUsers].sort(
      (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()
    ),
  });
}
