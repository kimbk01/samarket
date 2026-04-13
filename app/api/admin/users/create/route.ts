import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import { buildManualMemberAuthEmail } from "@/lib/auth/manual-member-email";

/**
 * 관리자 회원 수동 생성
 * - 일반 회원과 동일하게 Supabase `auth.users` + `public.profiles`(동일 PK = auth uid).
 * - `signInWithPassword`·RLS·`auth.uid()` 는 자가 가입 회원과 같은 경로로 동작.
 * - 추가: `test_users`(동일 id) — 일부 API·도구 보강용. 로그인은 `signInWithPassword` 경로로 통일.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireServiceKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }

  let body: {
    username?: string;
    password?: string;
    nickname?: string;
    email?: string;
    role?: string;
    contactPhone?: string;
    contactAddress?: string;
    phoneVerified?: boolean;
    /** LocationSelector regionId */
    regionCode?: string;
    /** LocationSelector cityId */
    cityCode?: string;
    addressStreetLine?: string;
    addressDetail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const nickname = String(body.nickname ?? "").trim();
  const emailRaw = String(body.email ?? "").trim().toLowerCase();
  const roleRaw = String(body.role ?? "normal").toLowerCase();
  const role = roleRaw === "premium" || roleRaw === "special" ? "special" : "member";
  const contactPhoneRaw = String(body.contactPhone ?? "").trim();
  const contactAddressRaw = String(body.contactAddress ?? "").trim();
  const phoneVerified = body.phoneVerified === true;
  const regionId = String(body.regionCode ?? "").trim();
  const cityId = String(body.cityCode ?? "").trim();
  const streetIn = String(body.addressStreetLine ?? "").trim().slice(0, 500);
  const detailIn = String(body.addressDetail ?? "").trim().slice(0, 500);

  const phNorm = normalizeOptionalPhMobileDb(contactPhoneRaw);
  if (!phNorm.ok) {
    return NextResponse.json({ ok: false, error: phNorm.error }, { status: 400 });
  }
  if (contactAddressRaw.length > 2000) {
    return NextResponse.json({ ok: false, error: "주소는 2000자 이하로 입력하세요." }, { status: 400 });
  }

  const contactPhone = phNorm.value;
  const region_code = encodeProfileAppLocationStorage(regionId, cityId);
  const region_name = buildProfileRegionNameForStorage(regionId, cityId);
  const address_street_line = streetIn || null;
  const address_detail = detailIn || null;
  /** test_users·어드민 상세 호환용 — 폼에서 합친 문자열이 없으면 DB 필드로 동일 규칙 재구성 */
  const contactAddress =
    contactAddressRaw ||
    [
      region_name?.trim(),
      [address_street_line, address_detail].filter(Boolean).join(" · "),
    ]
      .filter(Boolean)
      .join("\n") ||
    null;
  const email = emailRaw || buildManualMemberAuthEmail(username);

  if (!username || username.length < 2 || username.length > 64) {
    return NextResponse.json({ ok: false, error: "아이디는 2~64자로 입력하세요." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ ok: false, error: "비밀번호는 4자 이상 입력하세요." }, { status: 400 });
  }
  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ ok: false, error: "닉네임은 1~20자로 입력하세요." }, { status: 400 });
  }
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ ok: false, error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, {
    auth: { persistSession: false },
  });
  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nickname,
      username,
      login_id: username,
      auth_provider: "manual_admin",
    },
  });

  const id = created.user?.id;
  if (authError || !id) {
    return NextResponse.json(
      { ok: false, error: authError?.message || "실제 회원 생성에 실패했습니다." },
      { status: 500 }
    );
  }

  const profileRow: Record<string, unknown> = {
    id,
    email,
    username,
    nickname,
    role: role === "special" ? "special" : "user",
    member_type: role === "special" ? "premium" : "normal",
    is_special_member: role === "special",
    phone: contactPhone,
    phone_verified: phoneVerified,
    phone_verification_status: phoneVerified ? "verified" : contactPhone ? "pending" : "unverified",
    phone_verified_at: phoneVerified ? new Date().toISOString() : null,
    phone_verification_method: phoneVerified ? "admin_manual" : null,
    status: "active",
    preferred_country: "PH",
    auth_provider: "manual_admin",
    region_code,
    region_name,
    address_street_line,
    address_detail,
  };
  const { error: profileError } = await (supabase as any).from("profiles").upsert(profileRow);
  if (profileError) {
    await supabase.auth.admin.deleteUser(id);
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  const testUserRow: Record<string, unknown> = {
    id,
    username,
    password,
    role,
    display_name: nickname,
    contact_phone: contactPhone,
    contact_address: contactAddress,
  };
  const { error } = await (supabase as any).from("test_users").upsert(testUserRow);
  if (error) {
    await (supabase as any).from("profiles").delete().eq("id", id);
    await supabase.auth.admin.deleteUser(id);
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, error: "이미 사용 중인 아이디입니다." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id,
      username,
      nickname,
      email,
      role,
      phoneVerified,
    },
    /** 개발·운영 확인용: 이메일이 어떤 규칙으로 정해졌는지 */
    authEmailResolution: emailRaw ? "explicit_email" : "manual_local_default",
  });
}
