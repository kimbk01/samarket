import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { ProfileUpdatePayload } from "@/lib/profile/types";
import { runMeProfileReadPipeline } from "@/lib/profile/me-profile-read-pipeline";
import { peekMeProfileGetRouteCache, setMeProfileGetRouteCache } from "@/lib/profile/me-profile-get-route-cache";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { isValidPhilippinesMobilePhone, normalizePhilippinesPhoneNumber } from "@/lib/phone/philippines-phone";
import { enforceProfileEnsureQuota } from "@/lib/security/rate-limit-presets";
import { clearMeProfileGetRouteCache } from "@/lib/profile/me-profile-get-route-cache";
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

  // display_name(표시용 닉네임): 중복 허용, 자유 변경 가능
  if ("display_name" in b) {
    const n = String(b.display_name ?? "").trim();
    if (n.length < 2) return { ok: false, error: "닉네임은 2자 이상으로 입력해 주세요." };
    if (n.length > 20) return { ok: false, error: "닉네임은 20자 이내로 입력해 주세요." };
    patch.display_name = n;
  }

  // 레거시 호환: nickname 업데이트 요청은 display_name 업데이트로 처리한다.
  if ("nickname" in b) {
    const n = String(b.nickname ?? "").trim();
    if (n.length < 2) return { ok: false, error: "닉네임은 2자 이상으로 입력해 주세요." };
    if (n.length > 20) return { ok: false, error: "닉네임은 20자 이내로 입력해 주세요." };
    if (!("display_name" in patch)) patch.display_name = n;
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
      const normalizedPhone = normalizePhilippinesPhoneNumber(String(v));
      if (!isValidPhilippinesMobilePhone(normalizedPhone)) {
        return { ok: false, error: "필리핀 휴대폰 번호 형식을 확인해 주세요. 예: +639171234567" };
      }
      patch.phone = normalizedPhone;
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

/**
 * 내 프로필 조회 — `runMeProfileReadPipeline` 단일 경로(SNS 식별·행 보장) + 활성 세션 동기.
 * 클라이언트 세션 하이드레이션은 `GET` 만 사용한다(`POST /api/auth/profile/ensure` 는 하위 호환·특수 옵션용).
 */
export async function GET(request: NextRequest) {
  const tRoute0 = devPerfNow();
  const auth0 = devPerfNow();
  const auth = await requireAuthenticatedUserId();
  const requireAuthMs = devPerfNow() - auth0;
  if (!auth.ok) return auth.response;

  const quota0 = devPerfNow();
  const ensureRl = await enforceProfileEnsureQuota(auth.userId);
  const quotaMs = devPerfNow() - quota0;
  if (!ensureRl.ok) return ensureRl.response;

  const cached = peekMeProfileGetRouteCache(auth.userId);
  if (cached !== undefined) {
    const res = NextResponse.json({ ok: true, profile: cached });
    const sync0 = devPerfNow();
    if (cached) {
      try {
        await syncActiveSessionForUser(auth.userId, res, {
          rotate: false,
          sessionMeta: buildRequestSessionMeta(request),
          loginIdentifier: cached.auth_login_email ?? cached.email ?? null,
          request,
        });
      } catch {
        /* 세션 쿠키 동기 실패는 본문 응답에 영향 없음 — 기존 POST ensure 와 동일 */
      }
    }
    const syncSessionMs = devPerfNow() - sync0;
    logDevApiPerf("/api/me/profile", {
      auth_session_ms: Math.round(requireAuthMs),
      profile_query_ms: 0,
      store_query_ms: 0,
      badge_query_ms: 0,
      supabase_query_ms: 0,
      payload_build_ms: 0,
      quota_ms: Math.round(quotaMs),
      sync_session_ms: Math.round(syncSessionMs),
      total_route_ms: Math.round(devPerfNow() - tRoute0),
      route_client_ms: 0,
      get_user_ms: 0,
      profile_pipeline_ms: 0,
      dev_profile_cache_hit: 1,
    });
    return res;
  }

  const client0 = devPerfNow();
  const routeSb = await createSupabaseRouteHandlerClient();
  const routeClientMs = devPerfNow() - client0;
  if (!routeSb) {
    return serviceUnavailable("Supabase 가 설정되지 않았습니다.");
  }

  const getUser0 = devPerfNow();
  const {
    data: { user },
  } = await routeSb.auth.getUser();
  const getUserMs = devPerfNow() - getUser0;
  const supabaseUser = user?.id === auth.userId ? user : null;

  const serviceSb = tryCreateSupabaseServiceClient();
  const pipe0 = devPerfNow();
  const profile = await runMeProfileReadPipeline({
    authUserId: auth.userId,
    supabaseUser,
    routeSb,
    serviceSb,
  });
  const profilePipelineMs = devPerfNow() - pipe0;

  setMeProfileGetRouteCache(auth.userId, profile);

  const res = NextResponse.json({ ok: true, profile });
  const sync0 = devPerfNow();
  if (profile) {
    try {
      await syncActiveSessionForUser(auth.userId, res, {
        rotate: false,
        sessionMeta: buildRequestSessionMeta(request),
        loginIdentifier: profile.auth_login_email ?? profile.email ?? null,
        request,
      });
    } catch {
      /* 세션 쿠키 동기 실패는 본문 응답에 영향 없음 — 기존 POST ensure 와 동일 */
    }
  }
  const syncSessionMs = devPerfNow() - sync0;

  logDevApiPerf("/api/me/profile", {
    auth_session_ms: Math.round(requireAuthMs),
    route_client_ms: Math.round(routeClientMs),
    get_user_ms: Math.round(getUserMs),
    profile_pipeline_ms: Math.round(profilePipelineMs),
    quota_ms: Math.round(quotaMs),
    sync_session_ms: Math.round(syncSessionMs),
    supabase_query_ms: Math.round(profilePipelineMs),
    profile_query_ms: Math.round(profilePipelineMs),
    store_query_ms: 0,
    badge_query_ms: 0,
    payload_build_ms: Math.round(profilePipelineMs),
    total_route_ms: Math.round(devPerfNow() - tRoute0),
    dev_profile_cache_hit: 0,
  });
  return res;
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  clearMeProfileGetRouteCache(auth.userId);

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
