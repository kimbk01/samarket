import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import type { MemberType } from "@/lib/types/admin-user";
import { buildManualMemberAuthEmail } from "@/lib/auth/manual-member-email";

const PHONE_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"] as const;

async function loadActorIsMaster(sb: SupabaseClient, actorId: string): Promise<boolean> {
  const { data: p } = await sb.from("profiles").select("role").eq("id", actorId).maybeSingle();
  if (normalizeAdminRole((p as { role?: string } | null)?.role) === "master") return true;
  const { data: t } = await sb.from("test_users").select("role").eq("id", actorId).maybeSingle();
  return normalizeAdminRole((t as { role?: string } | null)?.role) === "master";
}

function memberTypeToProfileAndTestRole(memberType: MemberType): {
  profile: Record<string, unknown>;
  testRole: string;
} {
  switch (memberType) {
    case "normal":
      return {
        profile: { role: "user", member_type: "normal", is_special_member: false },
        testRole: "member",
      };
    case "premium":
      return {
        profile: { role: "special", member_type: "premium", is_special_member: true },
        testRole: "special",
      };
    case "admin":
      return {
        profile: { role: "admin", member_type: "admin", is_special_member: false },
        testRole: "admin",
      };
  }
}

type TestUserForEnsure = {
  username?: string | null;
  display_name?: string | null;
  role?: string | null;
  contact_phone?: string | null;
  password?: string | null;
};

/** test_users 기준으로 Supabase Auth에 동일 UUID 사용자가 없으면 생성 */
async function ensureAuthUserFromTestRow(sb: SupabaseClient, userId: string, tu: TestUserForEnsure) {
  const username = String(tu.username ?? "").trim().toLowerCase();
  if (username.length < 2) {
    return {
      ok: false as const,
      error: "invalid_test_username",
      status: 400,
      message: "test_users에 로그인 아이디(username)가 없어 정식 회원(Auth·profiles)을 만들 수 없습니다.",
    };
  }

  const pwd = String(tu.password ?? "").trim();
  const password = pwd.length >= 4 ? pwd : `Samarket${userId.replace(/-/g, "").slice(0, 14)}!9`;
  const nickname = String(tu.display_name ?? "").trim() || username;

  const payloadBase = {
    id: userId,
    password,
    email_confirm: true,
    user_metadata: {
      nickname,
      username,
      login_id: username,
      auth_provider: "manual_admin_backfill",
    },
  };

  let email = buildManualMemberAuthEmail(username);
  let { error: createErr } = await sb.auth.admin.createUser({
    ...payloadBase,
    email,
  } as never);

  if (
    createErr &&
    /email|duplicate|already registered/i.test(String(createErr.message ?? ""))
  ) {
    email = buildManualMemberAuthEmail(
      `${username}+${userId.replace(/-/g, "").slice(0, 12)}`
    );
    ({ error: createErr } = await sb.auth.admin.createUser({
      ...payloadBase,
      email,
    } as never));
  }

  const refetch = await sb.auth.admin.getUserById(userId);
  if (refetch.data?.user) {
    return { ok: true as const, user: refetch.data.user };
  }

  if (
    createErr &&
    !/already|exists|registered/i.test(String(createErr.message ?? ""))
  ) {
    return {
      ok: false as const,
      error: createErr.message || "auth_create_failed",
      status: 500,
      message: createErr.message,
    };
  }

  return {
    ok: false as const,
    error: "auth_create_failed",
    status: 500,
    message: createErr?.message ?? "Auth 계정 생성에 실패했습니다.",
  };
}

/**
 * profiles 없음 → (필요 시 test_users로 동일 UUID Auth 생성) → profiles upsert
 */
async function ensureProfileRow(
  sb: SupabaseClient,
  userId: string
): Promise<
  | { ok: true; profile: { id: string; role: string | null }; createdNew: boolean }
  | { ok: false; error: string; status: number; message?: string }
> {
  const { data: existing, error: exErr } = await sb
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message, status: 500 };
  if (existing) {
    return { ok: true, profile: existing as { id: string; role: string | null }, createdNew: false };
  }

  const { data: testUser, error: tuErr } = await sb
    .from("test_users")
    .select("username, display_name, role, contact_phone, password")
    .eq("id", userId)
    .maybeSingle();
  if (tuErr) return { ok: false, error: tuErr.message, status: 500 };

  const tu = testUser as TestUserForEnsure | null;

  let authUser = (await sb.auth.admin.getUserById(userId)).data?.user ?? null;

  if (!authUser) {
    if (!tu) {
      return {
        ok: false,
        error: "no_manual_row",
        status: 404,
        message: "test_users에 없는 UUID입니다. 관리자「수동 입력」으로 회원을 먼저 등록하세요.",
      };
    }
    const ensured = await ensureAuthUserFromTestRow(sb, userId, tu);
    if (!ensured.ok) {
      return {
        ok: false,
        error: ensured.error,
        status: ensured.status,
        message: ensured.message,
      };
    }
    authUser = ensured.user;
  }

  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;

  const usernameRaw =
    (
      tu?.username?.trim() ||
      (typeof meta.username === "string" && meta.username) ||
      (typeof meta.login_id === "string" && meta.login_id) ||
      ""
    ).trim() || null;

  const nickname = (
    tu?.display_name?.trim() ||
    (typeof meta.nickname === "string" && meta.nickname) ||
    usernameRaw ||
    authUser.email?.split("@")[0] ||
    userId.slice(0, 8)
  ).trim();

  const email =
    authUser.email?.trim() ||
    (usernameRaw
      ? buildManualMemberAuthEmail(usernameRaw)
      : buildManualMemberAuthEmail(userId));

  const tr = String(tu?.role ?? "member").trim().toLowerCase();
  let role: string;
  if (tr === "master") role = "master";
  else if (tr === "admin") role = "admin";
  else if (tr === "special" || tr === "premium") role = "special";
  else role = "user";

  const member_type =
    role === "master" || role === "admin" ? "admin" : role === "special" ? "premium" : "normal";
  const is_special_member = role === "special";
  const phone = tu?.contact_phone?.trim() || null;
  const phone_verification_status = phone ? "pending" : "unverified";

  const row: Record<string, unknown> = {
    id: userId,
    email,
    username: usernameRaw,
    nickname,
    role,
    member_type,
    is_special_member,
    phone,
    phone_verified: false,
    phone_verification_status,
    phone_verified_at: null,
    phone_verification_method: null,
    status: "active",
    preferred_country: "PH",
    auth_provider:
      (typeof meta.auth_provider === "string" && meta.auth_provider) ||
      (tu ? "manual_admin" : "sync_from_auth"),
  };

  const { error: upErr } = await sb.from("profiles").upsert(row);
  if (upErr) return { ok: false, error: upErr.message, status: 500 };

  const { data: created } = await sb.from("profiles").select("id, role").eq("id", userId).maybeSingle();
  if (!created) return { ok: false, error: "profile_upsert_missing", status: 500 };
  return { ok: true, profile: created as { id: string; role: string | null }, createdNew: true };
}

function phoneStatusToPatch(status: (typeof PHONE_VERIFICATION_STATUSES)[number]): Record<string, unknown> {
  switch (status) {
    case "verified":
      return {
        phone_verified: true,
        phone_verification_status: "verified",
        phone_verified_at: new Date().toISOString(),
        phone_verification_method: "admin_manual",
      };
    case "pending":
      return {
        phone_verified: false,
        phone_verification_status: "pending",
        phone_verified_at: null,
        phone_verification_method: null,
      };
    case "rejected":
      return {
        phone_verified: false,
        phone_verification_status: "rejected",
        phone_verified_at: null,
        phone_verification_method: null,
      };
    case "unverified":
      return {
        phone_verified: false,
        phone_verification_status: "unverified",
        phone_verified_at: null,
        phone_verification_method: null,
      };
  }
}

type AdminUserDetailRow = {
  id: string;
  username: string | null;
  email: string | null;
  role: string;
  display_name: string | null;
  nickname: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  phone_verified: boolean;
  phone_verification_status: string;
  created_at: string | null;
};

/**
 * 관리자: profiles + test_users 단건
 * GET /api/admin/users/:id
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const rawId = id?.trim();
  if (!rawId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const supabaseEnv = requireSupabaseEnv({ requireServiceKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, {
    auth: { persistSession: false },
  });
  const [{ data: profile, error: profileError }, { data: testUser, error: testUserError }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, username, email, role, nickname, phone, phone_verified, phone_verification_status, created_at, region_code, region_name, address_street_line, address_detail"
      )
      .eq("id", rawId)
      .maybeSingle(),
    supabase
      .from("test_users")
      .select("id, username, role, display_name, contact_phone, contact_address, created_at")
      .eq("id", rawId)
      .maybeSingle(),
  ]);

  if (profileError || testUserError) {
    return NextResponse.json(
      { ok: false, error: profileError?.message ?? testUserError?.message ?? "load_failed" },
      { status: 500 }
    );
  }
  if (!profile && !testUser) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const role =
    String(profile?.role ?? testUser?.role ?? "user").trim() || "user";

  const prof = profile as {
    region_code?: string | null;
    region_name?: string | null;
    address_street_line?: string | null;
    address_detail?: string | null;
  } | null;
  const fromTestAddr = (testUser?.contact_address as string | null | undefined)?.trim() ?? "";
  const fromProfileLines = resolveProfileLocationAddressLines({
    region_code: prof?.region_code,
    region_name: prof?.region_name,
    address_street_line: prof?.address_street_line,
    address_detail: prof?.address_detail,
  });
  const mergedContactAddress =
    fromTestAddr ||
    (fromProfileLines.length > 0 ? fromProfileLines.join("\n") : "") ||
    null;

  const user: AdminUserDetailRow = {
    id: rawId,
    username: (testUser?.username ?? profile?.username ?? null) as string | null,
    email: (profile?.email ?? null) as string | null,
    role,
    display_name: (testUser?.display_name ?? profile?.nickname ?? null) as string | null,
    nickname: (profile?.nickname ?? testUser?.display_name ?? null) as string | null,
    contact_phone: (profile?.phone ?? testUser?.contact_phone ?? null) as string | null,
    contact_address: mergedContactAddress,
    phone_verified: profile?.phone_verified === true,
    phone_verification_status:
      (profile?.phone_verification_status as string | null) ??
      (profile?.phone_verified ? "verified" : profile?.phone ? "pending" : "unverified"),
    created_at: (profile?.created_at ?? testUser?.created_at ?? null) as string | null,
  };

  return NextResponse.json({ ok: true, user });
}

/**
 * 회원 구분(memberType)·전화 인증 상태 — profiles 반영 (+ test_users.role 동기화)
 * PATCH /api/admin/users/:id
 * body: { memberType?: 'normal'|'premium'|'admin', phoneVerificationStatus?: ... }
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const supabaseEnv = requireSupabaseEnv({ requireServiceKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }

  let body: {
    memberType?: string;
    phoneVerificationStatus?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const memberTypeRaw = body.memberType;
  const phoneRaw = body.phoneVerificationStatus;
  const hasMember =
    memberTypeRaw !== undefined &&
    memberTypeRaw !== null &&
    String(memberTypeRaw).trim() !== "";
  const hasPhone =
    phoneRaw !== undefined && phoneRaw !== null && String(phoneRaw).trim() !== "";
  if (!hasMember && !hasPhone) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  let parsedMemberType: MemberType | null = null;
  if (hasMember) {
    const m = String(memberTypeRaw).trim().toLowerCase();
    if (m !== "normal" && m !== "premium" && m !== "admin") {
      return NextResponse.json({ ok: false, error: "invalid_member_type" }, { status: 400 });
    }
    parsedMemberType = m as MemberType;
  }

  let phoneStatus: (typeof PHONE_VERIFICATION_STATUSES)[number] | null = null;
  if (hasPhone) {
    const p = String(phoneRaw).trim().toLowerCase();
    if (!PHONE_VERIFICATION_STATUSES.includes(p as (typeof PHONE_VERIFICATION_STATUSES)[number])) {
      return NextResponse.json({ ok: false, error: "invalid_phone_status" }, { status: 400 });
    }
    phoneStatus = p as (typeof PHONE_VERIFICATION_STATUSES)[number];
  }

  const sb = createClient(supabaseEnv.url, supabaseEnv.serviceKey, {
    auth: { persistSession: false },
  });

  const { data: initialProfile, error: profileError } = await sb
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }
  let profile = initialProfile;
  if (!profile) {
    const ensured = await ensureProfileRow(sb, userId);
    if (!ensured.ok) {
      return NextResponse.json(
        { ok: false, error: ensured.error, message: ensured.message },
        { status: ensured.status }
      );
    }
    profile = ensured.profile;
  }

  const targetRole = normalizeAdminRole((profile as { role?: string }).role);
  const actorIsMaster = await loadActorIsMaster(sb, admin.userId);

  if (targetRole === "master" && !actorIsMaster) {
    return NextResponse.json(
      { ok: false, error: "forbidden_master_target" },
      { status: 403 }
    );
  }

  if (targetRole === "master" && parsedMemberType !== null && parsedMemberType !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_demote_master", message: "최고 관리자 계정의 구분을 일반·특별로 내릴 수 없습니다." },
      { status: 400 }
    );
  }

  if (
    parsedMemberType === "admin" &&
    targetRole !== "admin" &&
    targetRole !== "master" &&
    !actorIsMaster
  ) {
    return NextResponse.json(
      { ok: false, error: "forbidden_promote_admin", message: "관리자 구분으로 수정은 최고 관리자만 할 수 있습니다." },
      { status: 403 }
    );
  }

  if (
    targetRole === "admin" &&
    parsedMemberType !== null &&
    parsedMemberType !== "admin" &&
    !actorIsMaster
  ) {
    return NextResponse.json(
      { ok: false, error: "forbidden_demote_admin", message: "관리자 구분을 내리는 것은 최고 관리자만 할 수 있습니다." },
      { status: 403 }
    );
  }

  /** 목록에서는 master도 구분=관리자로 보임 — DB role=master 유지( admin으로 덮어쓰지 않음 ) */
  let memberTypeToApply: MemberType | null = parsedMemberType;
  if (parsedMemberType === "admin" && targetRole === "master") {
    memberTypeToApply = null;
  }

  if (memberTypeToApply === null && phoneStatus === null) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (memberTypeToApply !== null) {
    Object.assign(patch, memberTypeToProfileAndTestRole(memberTypeToApply).profile);
  }
  if (phoneStatus !== null) {
    Object.assign(patch, phoneStatusToPatch(phoneStatus));
  }

  const { error: updateError } = await sb.from("profiles").update(patch).eq("id", userId);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message || "update_failed" }, { status: 500 });
  }

  if (memberTypeToApply !== null) {
    const { data: testRow } = await sb.from("test_users").select("id").eq("id", userId).maybeSingle();
    if (testRow) {
      const { testRole } = memberTypeToProfileAndTestRole(memberTypeToApply);
      await sb.from("test_users").update({ role: testRole }).eq("id", userId);
    }
  }

  return NextResponse.json({ ok: true });
}
