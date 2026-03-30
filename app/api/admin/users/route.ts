import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
  region_name: string | null;
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
  created_at: string | null;
};

export async function GET(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const anon = createClient(url, anonKey);

  const supabase = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : anon;

  const { data: rows, error } = await (supabase as any)
    .from("profiles")
    .select(
      "id, email, username, nickname, role, member_type, status, region_name, points, phone_verified, phone_verification_status, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = new Set(((rows ?? []) as ProfileRow[]).map((row) => row.id));
  const { data: testRows } = await (supabase as any)
    .from("test_users")
    .select("id, username, display_name, role, created_at");
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
    return {
      id: r.id,
      loginUsername: testUser?.username?.trim() || r.username?.trim() || undefined,
      nickname: r.nickname?.trim() || testUser?.display_name?.trim() || r.username?.trim() || r.id,
      email: r.email ?? undefined,
      memberType,
      profileRole: r.role ?? undefined,
      hasProfile: true,
      moderationStatus: r.status === "active" ? "normal" : "warned",
      location: r.region_name ?? undefined,
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
      return {
        id: row.id,
        loginUsername: row.username?.trim() || undefined,
        nickname: row.display_name?.trim() || row.username?.trim() || row.id,
        memberType,
        profileRole: row.role ?? undefined,
        hasProfile: false,
        moderationStatus: "normal",
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
