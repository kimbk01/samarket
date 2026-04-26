import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { ProfileUpdatePayload } from "@/lib/profile/types";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 회원 프로필 위치 — `user_addresses`·매장 주소를 이 핸들러에서 수정하지 않음. @see `lib/addresses/address-source-architecture.ts` */

type PatchKey = keyof ProfileUpdatePayload;

const PROFILE_ADDRESS_KEYS = ["address_street_line", "address_detail"] as const;
const PROFILE_MAP_KEYS = ["latitude", "longitude", "full_address"] as const;

function serviceUnavailable(why: string) {
  return NextResponse.json({ ok: false, error: why }, { status: 503 });
}

/** PostgREST 스키마 캐시에 컬럼이 없을 때(마이그레이션 미적용) */
function isMissingProfileAddressColumnError(message: string): boolean {
  const m = message.toLowerCase();
  const mentionsCol =
    m.includes("address_detail") ||
    m.includes("address_street_line") ||
    m.includes("latitude") ||
    m.includes("longitude") ||
    m.includes("full_address");
  if (!mentionsCol) return false;
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("unknown column") ||
    (m.includes("column") && m.includes("profiles"))
  );
}

function mapProfileDbError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("profiles_nickname_lower_unique_idx") ||
    lower.includes("duplicate key") ||
    (lower.includes("unique") && lower.includes("nickname"))
  ) {
    return "이미 사용 중인 닉네임입니다";
  }
  if (isMissingProfileAddressColumnError(message)) {
    return (
      "DB에 프로필 주소·지도 컬럼이 없습니다. " +
      "마이그레이션 적용 후 잠시 뒤 다시 저장해 주세요."
    );
  }
  return message;
}

async function isNicknameTaken(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  userId: string,
  nickname: string
): Promise<boolean> {
  const normalized = nickname.trim().toLowerCase();
  if (!normalized) return false;
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .ilike("nickname", nickname.trim())
    .neq("id", userId)
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.some((row) => String((row as { id?: unknown }).id ?? "") !== userId);
}

/** 컬럼 미존재 시 한 번 더: 주소·지도 필드 없이 나머지만 저장 시도 */
function omitProfileAddressFields(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const k of PROFILE_ADDRESS_KEYS) {
    delete next[k];
  }
  for (const k of PROFILE_MAP_KEYS) {
    delete next[k];
  }
  return next;
}

function rowHasOptionalProfileAddressFields(row: Record<string, unknown>): boolean {
  return (
    PROFILE_ADDRESS_KEYS.some((k) => k in row) || PROFILE_MAP_KEYS.some((k) => k in row)
  );
}

function parsePatchBody(body: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "요청 형식이 올바르지 않습니다." };
  }
  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ("nickname" in b) {
    const n = String(b.nickname ?? "").trim();
    if (!n) return { ok: false, error: "닉네임을 입력해 주세요." };
    if (n.length > 20) return { ok: false, error: "닉네임은 20자 이내로 입력해 주세요." };
    patch.nickname = n;
    patch.display_name = n;
  }

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
  optText("address_street_line", true);
  optText("address_detail", true);
  if ("full_address" in b) {
    const v = b.full_address;
    if (v === null || v === "") patch.full_address = null;
    else patch.full_address = String(v ?? "").trim() || null;
  }
  if ("latitude" in b) {
    const v = b.latitude;
    if (v === null) patch.latitude = null;
    else {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return { ok: false, error: "latitude 값이 올바르지 않습니다." };
      patch.latitude = n;
    }
  }
  if ("longitude" in b) {
    const v = b.longitude;
    if (v === null) patch.longitude = null;
    else {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return { ok: false, error: "longitude 값이 올바르지 않습니다." };
      patch.longitude = n;
    }
  }
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
    patch.preferred_language = normalizeAppLanguage(b.preferred_language);
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
    /**
     * 1순위: service_role 로 강력하게 보정.
     * 2순위(production 에 service key 없을 때): 본인 쿠키 클라이언트로 INSERT-only.
     *   - `guard_profiles_self_update` 트리거는 UPDATE 에만 걸리므로 신규 INSERT 는 허용
     *   - RLS `profiles_insert_own_or_admin` 의 `id = auth.uid()` 도 통과
     *   - `ensureAuthProfileRow` 는 첫 시도 실패 시 id-only 수준의 minimal fallback 으로 강하한다
     */
    const svc = tryCreateSupabaseServiceClient();
    if (svc) {
      try {
        await ensureAuthProfileRow(svc, user);
      } catch {
        await ensureProfileForUserId(svc, auth.userId);
      }
      profile = await fetchProfileRowSafe(routeSb, auth.userId);
      if (!profile) profile = await fetchProfileRowSafe(svc, auth.userId);
    } else {
      try {
        await ensureAuthProfileRow(routeSb, user);
      } catch {
        // INSERT-only 도 막혔다면 다음 GET 에서 다시 시도하도록 한 다음, 우선 null 반환
      }
      profile = await fetchProfileRowSafe(routeSb, auth.userId);
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
  const nickname = typeof parsed.patch.nickname === "string" ? parsed.patch.nickname.trim() : "";
  if (serviceSb && nickname && (await isNicknameTaken(serviceSb, auth.userId, nickname))) {
    return NextResponse.json({ ok: false, error: "이미 사용 중인 닉네임입니다" }, { status: 409 });
  }
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
      rowHasOptionalProfileAddressFields(row)
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
            "프로필은 저장되었으나 DB에 주소·지도 컬럼이 없어 위치는 반영되지 않았습니다. 마이그레이션을 확인해 주세요.",
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
    rowHasOptionalProfileAddressFields(row)
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
          "프로필은 저장되었으나 DB에 주소·지도 컬럼이 없어 위치는 반영되지 않았습니다. 마이그레이션을 확인해 주세요.",
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
