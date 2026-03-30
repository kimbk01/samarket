import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";

export const dynamic = "force-dynamic";

type PatchKey = keyof ProfileUpdatePayload;

const PROFILE_ADDRESS_KEYS = ["postal_code", "address_street_line", "address_detail"] as const;

function serviceUnavailable(why: string) {
  return NextResponse.json({ ok: false, error: why }, { status: 503 });
}

/** PostgREST 스키마 캐시에 컬럼이 없을 때(마이그레이션 미적용) */
function isMissingProfileAddressColumnError(message: string): boolean {
  const m = message.toLowerCase();
  const mentionsCol =
    m.includes("address_detail") ||
    m.includes("address_street_line") ||
    m.includes("postal_code");
  if (!mentionsCol) return false;
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("unknown column") ||
    m.includes("column") && m.includes("profiles")
  );
}

function mapProfileDbError(message: string): string {
  if (isMissingProfileAddressColumnError(message)) {
    return (
      "DB에 프로필 주소 컬럼(postal_code, address_street_line, address_detail)이 없습니다. " +
      "Supabase SQL Editor에서 저장소의 scripts/profiles-postal-code.sql 을 실행한 뒤 잠시 기다렸다가 다시 저장해 주세요."
    );
  }
  return message;
}

/** 컬럼 미존재 시 한 번 더: 주소 필드 없이 나머지만 저장 시도 */
function omitProfileAddressFields(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const k of PROFILE_ADDRESS_KEYS) {
    delete next[k];
  }
  return next;
}

function parsePatchBody(body: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "요청 형식이 올바르지 않습니다." };
  }
  const b = body as Record<string, unknown>;
  const n = String(b.nickname ?? "").trim();
  if (!n) return { ok: false, error: "닉네임을 입력해 주세요." };
  if (n.length > 20) return { ok: false, error: "닉네임은 20자 이내로 입력해 주세요." };

  const patch: Record<string, unknown> = { nickname: n };

  if ("avatar_url" in b) {
    const v = b.avatar_url;
    if (v === null || v === "") patch.avatar_url = null;
    else {
      const s = String(v).trim();
      patch.avatar_url = s || null;
    }
  }

  const optText = (key: PatchKey, allowNull: boolean) => {
    if (!(key in b)) return;
    const v = b[key];
    if (allowNull && (v === null || v === "")) {
      patch[key] = null;
      return;
    }
    patch[key] = String(v ?? "").trim() || null;
  };

  optText("bio", true);
  optText("region_code", true);
  optText("region_name", true);
  optText("postal_code", true);
  optText("address_street_line", true);
  optText("address_detail", true);
  if ("phone" in b) {
    const v = b.phone;
    if (v === null || v === "") {
      patch.phone = null;
    } else {
      const r = normalizeOptionalPhMobileDb(String(v));
      if (!r.ok) return { ok: false, error: r.error };
      patch.phone = r.value;
    }
  }
  if ("preferred_language" in b) {
    const s = String(b.preferred_language ?? "ko").trim() || "ko";
    patch.preferred_language = s;
  }
  if ("preferred_country" in b) {
    const s = String(b.preferred_country ?? "PH").trim() || "PH";
    patch.preferred_country = s;
  }

  return { ok: true, patch };
}

/** 테스트 로그인(쿠키)은 브라우저 Supabase 세션이 없어 RLS update/select 가 동작하지 않음 — 서비스 롤 또는 동일 JWT 세션으로만 처리 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const serviceSb = tryCreateSupabaseServiceClient();
  if (serviceSb) {
    let profile = await fetchProfileRowSafe(serviceSb, auth.userId);
    if (!profile) {
      profile = await ensureProfileForUserId(serviceSb, auth.userId);
    }
    return NextResponse.json({ ok: true, profile });
  }

  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return serviceUnavailable("Supabase 가 설정되지 않았습니다.");
  }
  const {
    data: { user },
  } = await routeSb.auth.getUser();
  if (!user?.id || user.id !== auth.userId) {
    return serviceUnavailable(
      "아이디 로그인(테스트)으로 저장·조회하려면 서버에 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."
    );
  }
  let profile = await fetchProfileRowSafe(routeSb, auth.userId);
  if (!profile) {
    const svc = tryCreateSupabaseServiceClient();
    if (svc) {
      profile = await ensureProfileForUserId(svc, auth.userId);
    }
  }
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 이 필요합니다." }, { status: 400 });
  }

  const parsed = parsePatchBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const row = {
    ...parsed.patch,
    updated_at: new Date().toISOString(),
  };

  const serviceSb = tryCreateSupabaseServiceClient();
  if (serviceSb) {
    let attemptRow: Record<string, unknown> = row;
    let { data, error } = await serviceSb
      .from("profiles")
      .update(attemptRow)
      .eq("id", auth.userId)
      .select("id")
      .maybeSingle();
    if (
      error &&
      isMissingProfileAddressColumnError(error.message ?? "") &&
      PROFILE_ADDRESS_KEYS.some((k) => k in row)
    ) {
      attemptRow = omitProfileAddressFields(row);
      const second = await serviceSb
        .from("profiles")
        .update(attemptRow)
        .eq("id", auth.userId)
        .select("id")
        .maybeSingle();
      data = second.data;
      error = second.error;
      if (!error) {
        return NextResponse.json({
          ok: true,
          warning:
            "프로필은 저장되었으나 DB에 주소 컬럼이 없어 우편번호·지번·동호는 반영되지 않았습니다. scripts/profiles-postal-code.sql 을 Supabase에서 실행해 주세요.",
        });
      }
    }
    if (error) {
      return NextResponse.json(
        { ok: false, error: mapProfileDbError(error.message ?? "저장 실패") },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "프로필 행을 찾을 수 없습니다. 가입·동기화 후 다시 시도해 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return serviceUnavailable("Supabase 가 설정되지 않았습니다.");
  }
  const {
    data: { user },
  } = await routeSb.auth.getUser();
  if (!user?.id || user.id !== auth.userId) {
    return serviceUnavailable(
      "아이디 로그인(테스트)으로 저장하려면 서버에 SUPABASE_SERVICE_ROLE_KEY 를 넣어 주세요."
    );
  }
  let attemptRow: Record<string, unknown> = row;
  let { data, error } = await routeSb
    .from("profiles")
    .update(attemptRow)
    .eq("id", auth.userId)
    .select("id")
    .maybeSingle();
  if (
    error &&
    isMissingProfileAddressColumnError(error.message ?? "") &&
    PROFILE_ADDRESS_KEYS.some((k) => k in row)
  ) {
    attemptRow = omitProfileAddressFields(row);
    const second = await routeSb
      .from("profiles")
      .update(attemptRow)
      .eq("id", auth.userId)
      .select("id")
      .maybeSingle();
    data = second.data;
    error = second.error;
    if (!error) {
      return NextResponse.json({
        ok: true,
        warning:
          "프로필은 저장되었으나 DB에 주소 컬럼이 없어 우편번호·지번·동호는 반영되지 않았습니다. scripts/profiles-postal-code.sql 을 Supabase에서 실행해 주세요.",
      });
    }
  }
  if (error) {
    return NextResponse.json(
      { ok: false, error: mapProfileDbError(error.message ?? "저장 실패") },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "프로필 행을 찾을 수 없습니다. 가입·동기화 후 다시 시도해 주세요." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
