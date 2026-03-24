import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

/**
 * 관리자 회원 수동 생성 — test_users에 추가 (서비스 롤).
 * 이후 /api/test-login + 로그인 페이지「아이디 로그인」으로 세션 연결 시 전 API가 동일 UUID로 인식.
 * POST body: { username, password, displayName, role, contactPhone?, contactAddress? }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase 설정 없음" }, { status: 500 });
  }

  let body: {
    username?: string;
    password?: string;
    displayName?: string;
    role?: string;
    contactPhone?: string;
    contactAddress?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim();
  const roleRaw = String(body.role ?? "normal").toLowerCase();
  const role = roleRaw === "premium" || roleRaw === "special" ? "special" : "member";
  const contactPhoneRaw = String(body.contactPhone ?? "").trim();
  const contactAddressRaw = String(body.contactAddress ?? "").trim();
  if (contactPhoneRaw.length > 64) {
    return NextResponse.json({ ok: false, error: "연락처는 64자 이하로 입력하세요." }, { status: 400 });
  }
  if (contactAddressRaw.length > 2000) {
    return NextResponse.json({ ok: false, error: "주소는 2000자 이하로 입력하세요." }, { status: 400 });
  }
  const contactPhone = contactPhoneRaw || null;
  const contactAddress = contactAddressRaw || null;

  if (!username || username.length < 2 || username.length > 64) {
    return NextResponse.json({ ok: false, error: "아이디는 2~64자로 입력하세요." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ ok: false, error: "비밀번호는 4자 이상 입력하세요." }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const id = randomUUID();

  const row: Record<string, unknown> = {
    id,
    username,
    password,
    role,
    display_name: displayName || null,
    contact_phone: contactPhone,
    contact_address: contactAddress,
  };

  const { error } = await (supabase as any)
    .from("test_users")
    .insert(row);

  if (error) {
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
      displayName: displayName || username,
      role,
    },
  });
}
