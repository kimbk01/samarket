import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  buildProfileRegionNameForStorage,
  encodeProfileAppLocationStorage,
} from "@/lib/profile/profile-location";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapProfileCreateError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("profiles_nickname_lower_unique_idx") ||
    lower.includes("duplicate key") ||
    (lower.includes("unique") && lower.includes("nickname"))
  ) {
    return "이미 사용 중인 닉네임입니다";
  }
  return message;
}

/**
 * 관리자 회원 수동 생성
 * - 일반 회원과 동일하게 Supabase `auth.users` + `public.profiles`(동일 PK = auth uid).
 * - `signInWithPassword`·RLS·`auth.uid()` 는 자가 가입 회원과 같은 경로로 동작.
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
    name?: string;
    accountType?: string;
    contactPhone?: string;
    contactAddress?: string;
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
  const name = String(body.name ?? "").trim();
  const accountTypeRaw = String(body.accountType ?? "development_member").trim().toLowerCase();
  const isAdminAccount = accountTypeRaw === "admin";
  const memberType = isAdminAccount ? "admin" : "normal";
  const contactPhoneRaw = String(body.contactPhone ?? "").trim();
  const contactAddressRaw = String(body.contactAddress ?? "").trim();
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
  const email = emailRaw;
  const phoneCountryCode = contactPhone ? "+63" : null;
  const phoneNumber = contactPhone ? contactPhone.replace(/^\+63/, "") : null;
  const nowIso = new Date().toISOString();

  if (!username || username.length < 2 || username.length > 64) {
    return NextResponse.json({ ok: false, error: "아이디는 2~64자로 입력하세요." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ ok: false, error: "비밀번호는 4자 이상 입력하세요." }, { status: 400 });
  }
  if (!nickname || nickname.length > 20) {
    return NextResponse.json({ ok: false, error: "닉네임은 1~20자로 입력하세요." }, { status: 400 });
  }
  if (!name || name.length > 50) {
    return NextResponse.json({ ok: false, error: "이름은 1~50자로 입력하세요." }, { status: 400 });
  }
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ ok: false, error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!["development_member", "operations_member", "admin"].includes(accountTypeRaw)) {
    return NextResponse.json({ ok: false, error: "권한 유형이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, {
    auth: { persistSession: false },
  });
  const { data: nicknameRows } = await supabase
    .from("profiles")
    .select("id")
    .ilike("nickname", nickname)
    .limit(1);
  if (Array.isArray(nicknameRows) && nicknameRows.length > 0) {
    return NextResponse.json({ ok: false, error: "이미 사용 중인 닉네임입니다" }, { status: 409 });
  }
  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nickname,
      full_name: name,
      username,
      login_id: username,
      provider: "admin_manual",
      auth_provider: "admin_manual",
      manual_account_type: accountTypeRaw,
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
    auth_login_email: email,
    display_name: nickname,
    username,
    nickname,
    realname: name,
    role: isAdminAccount ? "admin" : "user",
    is_admin: isAdminAccount,
    member_type: memberType,
    member_status: "active",
    verified_member_at: nowIso,
    manual_account_type: accountTypeRaw,
    is_special_member: false,
    phone: contactPhone,
    phone_country_code: phoneCountryCode,
    phone_number: phoneNumber,
    phone_verified: true,
    phone_verification_status: "verified",
    phone_verified_at: nowIso,
    phone_verification_method: "admin_manual",
    status: "verified_user",
    preferred_country: "PH",
    provider: "admin_manual",
    auth_provider: "admin_manual",
    created_by_admin: admin.userId,
    last_login_at: nowIso,
    region_code,
    region_name,
    address_street_line,
    address_detail,
  };
  const { error: profileError } = await (supabase as any).from("profiles").upsert(profileRow);
  if (profileError) {
    await supabase.auth.admin.deleteUser(id);
    return NextResponse.json({ ok: false, error: mapProfileCreateError(profileError.message) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id,
      username,
      nickname,
      name,
      email,
      role: isAdminAccount ? "admin" : "user",
      memberType,
      accountType: accountTypeRaw,
      phoneVerified: true,
    },
  });
}
