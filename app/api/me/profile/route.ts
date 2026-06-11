import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId, getOptionalRouteHandlerCookieAuth } from "@/lib/auth/api-session";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import {
  ME_PROFILE_GET_SESSION_TOUCH_THROTTLE_SEC,
  syncActiveSessionForUser,
  type SyncSessionTelemetry,
} from "@/lib/auth/server-guards";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { ProfileRow, ProfileUpdatePayload } from "@/lib/profile/types";
import {
  createEmptyMeProfilePipelinePerf,
  runMeProfileReadPipeline,
  type MeProfilePipelinePerf,
} from "@/lib/profile/me-profile-read-pipeline";
import {
  clearMeProfileGetRouteCache,
  ME_PROFILE_GET_ROUTE_CACHE_TTL_MS,
  peekMeProfileGetRouteCache,
  setMeProfileGetRouteCache,
} from "@/lib/profile/me-profile-get-route-cache";
import {
  clearMeProfileResponseCachesForUser,
  ME_PROFILE_RESPONSE_CACHE_TTL_MS,
  peekMeProfileGetResponseCacheDetailed,
  setMeProfileGetResponseCache,
} from "@/lib/profile/me-profile-get-response-cache";
import { createEmptyProfileFetchMetrics, type ProfileFetchMetrics } from "@/lib/profile/fetch-profile-row-safe";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";
import { normalizeAppLanguage, normalizeLanguagePreferenceForStorage } from "@/lib/i18n/config";
import { enforceProfileEnsureQuota } from "@/lib/security/rate-limit-presets";
import {
  clearProfileResponseCacheForUser,
  peekProfileResponseCache,
  PROFILE_RESPONSE_CACHE_TTL_MS as PROFILE_PROD_RESPONSE_CACHE_TTL_MS,
  setProfileResponseCache,
} from "@/lib/profile/profile-response-cache";
import { jsonError } from "@/lib/http/api-route";
import { shouldBypassRouteMemoryCache } from "@/lib/http/route-cache-bypass";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import { computeProfileCompleted } from "@/lib/profile/profile-completed";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/profile — 동일 userId 동시 요청이 `runMeProfileReadPipeline` 을 한 번만 타도록 (userId 키 분리, 실패 응답은 캐시하지 않음).
 * @see `PROFILE_ROUTE_PIPELINE_COALESCE_MS` — `[dev-api-perf]` 의 `profile_cache_ttl_ms` 설계 상한
 */
type MeProfilePipelineFlight = {
  profile: ProfileRow | null;
  profilePipelineMs: number;
  profileFetchMetrics: ProfileFetchMetrics;
  pipelineStepMs: MeProfilePipelinePerf;
};
const ME_PROFILE_PIPELINE_INFLIGHT = new Map<string, Promise<MeProfilePipelineFlight>>();
const PROFILE_ROUTE_PIPELINE_COALESCE_MS = ME_PROFILE_GET_ROUTE_CACHE_TTL_MS;

function buildProfilePipelineStepsJson(perf: MeProfilePipelinePerf): string {
  return JSON.stringify({
    ensure_user_profile_ms: perf.ensure_user_profile_ms,
    ensure_profile_total_ms: perf.ensure_profile_total_ms,
    ensure_profile_existing_check_ms: perf.ensure_profile_existing_check_ms,
    ensure_profile_auth_row_check_ms: perf.ensure_profile_auth_row_check_ms,
    ensure_profile_insert_ms: perf.ensure_profile_insert_ms,
    ensure_profile_upsert_ms: perf.ensure_profile_upsert_ms,
    ensure_profile_update_ms: perf.ensure_profile_update_ms,
    ensure_profile_rpc_ms: perf.ensure_profile_rpc_ms,
    ensure_profile_policy_or_rls_wait_ms: perf.ensure_profile_policy_or_rls_wait_ms,
    profile_row_fetch_ms: perf.profile_row_fetch_ms,
    profile_row_normalize_ms: perf.profile_row_normalize_ms,
    profile_row_fallback_ms: perf.profile_row_fallback_ms,
    profile_pipeline_total_ms: perf.pipeline_total_ms,
  });
}

function extractEnsureProfileNumericPhases(perf: MeProfilePipelinePerf): Record<string, number> {
  return {
    ensure_profile_total_ms: Math.round(perf.ensure_profile_total_ms),
    ensure_profile_existing_check_ms: Math.round(perf.ensure_profile_existing_check_ms),
    ensure_profile_auth_row_check_ms: Math.round(perf.ensure_profile_auth_row_check_ms),
    ensure_profile_insert_ms: Math.round(perf.ensure_profile_insert_ms),
    ensure_profile_upsert_ms: Math.round(perf.ensure_profile_upsert_ms),
    ensure_profile_update_ms: Math.round(perf.ensure_profile_update_ms),
    ensure_profile_rpc_ms: Math.round(perf.ensure_profile_rpc_ms),
    ensure_profile_policy_or_rls_wait_ms: Math.round(perf.ensure_profile_policy_or_rls_wait_ms),
    ensure_profile_attempt_count: perf.ensure_profile_attempt_count,
    ensure_profile_write_executed: perf.ensure_profile_write_executed,
    ensure_profile_read_executed: perf.ensure_profile_read_executed,
  };
}

function ensureProfileDiagForDevPerf(perf: MeProfilePipelinePerf): Record<string, string | number> {
  const o: Record<string, string | number> = {};
  if (perf.ensure_profile_patch_keys != null) o.ensure_profile_patch_keys = perf.ensure_profile_patch_keys;
  if (perf.ensure_profile_patch_count != null) o.ensure_profile_patch_count = perf.ensure_profile_patch_count;
  if (perf.ensure_profile_provider_persist_reason != null) {
    o.ensure_profile_provider_persist_reason = perf.ensure_profile_provider_persist_reason;
  }
  if (perf.ensure_profile_normalize_mismatch != null) {
    o.ensure_profile_normalize_mismatch = perf.ensure_profile_normalize_mismatch;
  }
  if (perf.ensure_profile_skipped_fields != null) o.ensure_profile_skipped_fields = perf.ensure_profile_skipped_fields;
  if (perf.ensure_profile_provider_existing_provider != null) {
    o.ensure_profile_provider_existing_provider = perf.ensure_profile_provider_existing_provider;
  }
  if (perf.ensure_profile_provider_existing_auth_provider != null) {
    o.ensure_profile_provider_existing_auth_provider = perf.ensure_profile_provider_existing_auth_provider;
  }
  if (perf.ensure_profile_provider_existing_provider_user_id != null) {
    o.ensure_profile_provider_existing_provider_user_id = perf.ensure_profile_provider_existing_provider_user_id;
  }
  if (perf.ensure_profile_provider_next_provider != null) {
    o.ensure_profile_provider_next_provider = perf.ensure_profile_provider_next_provider;
  }
  if (perf.ensure_profile_provider_next_auth_provider != null) {
    o.ensure_profile_provider_next_auth_provider = perf.ensure_profile_provider_next_auth_provider;
  }
  if (perf.ensure_profile_provider_next_provider_user_id != null) {
    o.ensure_profile_provider_next_provider_user_id = perf.ensure_profile_provider_next_provider_user_id;
  }
  if (perf.ensure_profile_provider_noop_skip != null) {
    o.ensure_profile_provider_noop_skip = perf.ensure_profile_provider_noop_skip;
  }
  if (perf.ensure_profile_patch_count_after != null) {
    o.ensure_profile_patch_count_after = perf.ensure_profile_patch_count_after;
  }
  return o;
}

function slowestProfilePipelineStep(perf: MeProfilePipelinePerf): { step: string; ms: number } {
  const pairs: [string, number][] = [
    ["ensure_user_profile", perf.ensure_user_profile_ms],
    ["ensure_profile_total", perf.ensure_profile_total_ms],
    ["profile_row_fetch", perf.profile_row_fetch_ms],
    ["profile_row_normalize", perf.profile_row_normalize_ms],
    ["profile_row_fallback", perf.profile_row_fallback_ms],
  ];
  let best: { step: string; ms: number } = { step: "none", ms: 0 };
  for (const [step, ms] of pairs) {
    if (ms > best.ms) best = { step, ms };
  }
  return best;
}

function emptySyncTelemetry(): SyncSessionTelemetry {
  return {
    sync_profiles_update_skipped: 1,
    sync_profiles_update_executed: 0,
    sync_registry_sync_skipped: 1,
    sync_registry_sync_executed: 0,
    sync_touch_reason: "unset",
    sync_last_login_age_ms: -1,
    sync_same_session_id: 0,
    sync_same_device_info: 0,
    sync_write_policy: "unset",
    sync_profile_write_throttle_ms: 0,
    sync_registry_write_throttle_ms: 0,
    sync_profile_write_due: 0,
    sync_registry_write_due: 0,
    sync_profile_write_skipped_reason: "unset",
    sync_registry_write_skipped_reason: "unset",
  };
}

/** `[dev-api-perf]` phases 숫자 필드 — bottleneck 후보에 포함 가능 */
function syncTelemetryPerfNumbers(tel: SyncSessionTelemetry): Record<string, number> {
  return {
    sync_profile_write_throttle_ms: tel.sync_profile_write_throttle_ms,
    sync_registry_write_throttle_ms: tel.sync_registry_write_throttle_ms,
    sync_profile_write_due: tel.sync_profile_write_due,
    sync_registry_write_due: tel.sync_registry_write_due,
  };
}

function syncTelemetryPerfExtras(tel: SyncSessionTelemetry): Record<string, string> {
  return {
    sync_write_policy: tel.sync_write_policy,
    sync_profile_write_skipped_reason: tel.sync_profile_write_skipped_reason,
    sync_registry_write_skipped_reason: tel.sync_registry_write_skipped_reason,
  };
}

/** 핸들러 내부에서 관측 가능한 구간 중 최대 1개 — compile 은 포함하지 않음 */
function computeTopProfileBottleneck(
  totalRouteMs: number,
  parts: Record<string, number>
): { top_profile_bottleneck: string; top_profile_bottleneck_ms: number; top_profile_bottleneck_percent: number } {
  let top = "none";
  let topMs = 0;
  for (const [k, v] of Object.entries(parts)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    if (n > topMs) {
      topMs = n;
      top = k;
    }
  }
  const denom = totalRouteMs > 0 ? totalRouteMs : topMs > 0 ? topMs : 1;
  const pct = Math.round((topMs / denom) * 100);
  return {
    top_profile_bottleneck: top,
    top_profile_bottleneck_ms: Math.round(topMs),
    top_profile_bottleneck_percent: pct,
  };
}

/** `[dev-api-perf]` — 핸들러 내부 구간 TOP1 (webpack compile 제외) */
function finalizeMeProfileGetPerfLog(
  phases: Record<string, number>,
  extras: Record<string, string | number | boolean | null | undefined>
): void {
  const total = phases.total_route_ms ?? 0;
  const top = computeTopProfileBottleneck(total, {
    auth_session_ms: phases.auth_session_ms ?? 0,
    quota_ms: phases.quota_ms ?? 0,
    get_user_ms: phases.get_user_ms ?? 0,
    profile_pipeline_ms: phases.profile_pipeline_ms ?? 0,
    sync_session_ms: phases.sync_session_ms ?? 0,
    json_payload_serialize_probe_ms: phases.json_payload_serialize_probe_ms ?? 0,
    api_render_ms: phases.api_render_ms ?? 0,
    profile_response_cache_lookup_ms: phases.profile_response_cache_lookup_ms ?? 0,
    profile_response_cache_store_ms: phases.profile_response_cache_store_ms ?? 0,
    profile_fetch_total_ms: phases.profile_fetch_total_ms ?? 0,
    ensure_profile_total_ms: phases.ensure_profile_total_ms ?? 0,
  });
  logDevApiPerf("/api/me/profile", phases, {
    ...extras,
    top_profile_bottleneck: top.top_profile_bottleneck,
    top_profile_bottleneck_ms: top.top_profile_bottleneck_ms,
    top_profile_bottleneck_percent: top.top_profile_bottleneck_percent,
  });
}

/** 회원 프로필 위치 — `user_addresses`·매장 주소를 이 핸들러에서 수정하지 않음. @see `lib/addresses/address-source-architecture.ts` */

type PatchKey = keyof ProfileUpdatePayload;

const PROFILE_ADDRESS_KEYS = ["address_street_line", "address_detail"] as const;
const PROFILE_MAP_KEYS = ["latitude", "longitude", "full_address"] as const;
const PROFILE_COMPLETION_KEYS = ["profile_completed"] as const;

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
    m.includes("full_address") ||
    m.includes("profile_completed");
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
  for (const k of PROFILE_COMPLETION_KEYS) {
    delete next[k];
  }
  return next;
}

function rowHasOptionalProfileAddressFields(row: Record<string, unknown>): boolean {
  return (
    PROFILE_ADDRESS_KEYS.some((k) => k in row) ||
    PROFILE_MAP_KEYS.some((k) => k in row) ||
    PROFILE_COMPLETION_KEYS.some((k) => k in row)
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
  // 전화번호는 OTP 인증 API만 갱신 — 프로필 PATCH 로 덮어쓰지 않음
  if ("phone" in b) {
    return {
      ok: false,
      error: "전화번호는 프로필 저장이 아닌 전화 인증에서 등록·변경해 주세요.",
    };
  }
  if ("preferred_language" in b) {
    patch.preferred_language = normalizeLanguagePreferenceForStorage(b.preferred_language);
  }
  if ("preferred_country" in b) {
    const s = String(b.preferred_country ?? "PH").trim() || "PH";
    patch.preferred_country = s;
  }

  return { ok: true, patch };
}

type ProfileCompletionRow = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

async function fetchProfileCompletionRow(
  userId: string
): Promise<ProfileCompletionRow | null> {
  const serviceSb = tryCreateSupabaseServiceClient();
  const sb = serviceSb ?? (await createSupabaseRouteHandlerClient());
  if (!sb) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ProfileCompletionRow;
  return {
    username: row.username ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
  };
}

function applyProfileCompletedFromMergedRow(
  patch: Record<string, unknown>,
  existing: ProfileCompletionRow | null
): void {
  const merged = {
    username:
      "username" in patch
        ? (patch.username as string | null)
        : (existing?.username ?? null),
    display_name:
      "display_name" in patch
        ? (patch.display_name as string | null)
        : (existing?.display_name ?? null),
    avatar_url:
      "avatar_url" in patch ? (patch.avatar_url as string | null) : (existing?.avatar_url ?? null),
  };
  patch.profile_completed = computeProfileCompleted(merged);
}

/**
 * 내 프로필 조회 — `runMeProfileReadPipeline` 단일 경로(SNS 식별·행 보장) + 활성 세션 동기.
 * 클라이언트 세션 하이드레이션은 `GET` 만 사용한다(`POST /api/auth/profile/ensure` 는 하위 호환·특수 옵션용).
 */
export async function GET(request: NextRequest) {
  const tRoute0 = devPerfNow();
  const mode: "full" | "lite" = request.nextUrl.searchParams.get("lite") === "1" ? "lite" : "full";

  const auth0 = devPerfNow();
  const cookieAuth = await getOptionalRouteHandlerCookieAuth();
  const requireAuthMs = devPerfNow() - auth0;
  if (!cookieAuth.userId) {
    return jsonError("로그인이 필요합니다.", 401, { authenticated: false });
  }
  const userId = cookieAuth.userId;
  const bypassRouteCache = shouldBypassRouteMemoryCache(request.nextUrl.searchParams);

  const quota0 = devPerfNow();
  const ensureRl = await enforceProfileEnsureQuota(userId);
  const quotaMs = devPerfNow() - quota0;
  if (!ensureRl.ok) return ensureRl.response;

  const tProdPeek0 = devPerfNow();
  const prodProfilePeek = bypassRouteCache
    ? ({ hit: false as const, reason: "miss" as const, cache_key: `${userId}\0${mode}` })
    : peekProfileResponseCache(userId, mode);
  const prod_profile_response_cache_lookup_ms = Math.round(devPerfNow() - tProdPeek0);

  if (prodProfilePeek.hit) {
    const responseCacheAgeMs = Math.round(Date.now() - prodProfilePeek.storedAt);
    const syncTel = emptySyncTelemetry();
    const body = { ok: true, profile: prodProfilePeek.profile };
    let json_payload_serialize_probe_ms = 0;
    if (process.env.NODE_ENV === "development") {
      const j0 = devPerfNow();
      JSON.stringify(body);
      json_payload_serialize_probe_ms = Math.round(devPerfNow() - j0);
    }
    const r0 = devPerfNow();
    const res = NextResponse.json(body);
    const api_render_ms = Math.round(devPerfNow() - r0);
    const syncPhase: Partial<
      Record<
        "sync_prefetch_profile_ms" | "sync_profiles_update_ms" | "sync_registry_ms" | "sync_cookie_ms",
        number
      >
    > = {};
    const sync0 = devPerfNow();
    try {
      await syncActiveSessionForUser(userId, res, {
        rotate: false,
        sessionMeta: buildRequestSessionMeta(request),
        loginIdentifier: prodProfilePeek.profile.auth_login_email ?? prodProfilePeek.profile.email ?? null,
        request,
        existingProfile: prodProfilePeek.profile,
        touchProfileThrottleSeconds: ME_PROFILE_GET_SESSION_TOUCH_THROTTLE_SEC,
        devSyncPhaseMs: syncPhase,
        syncTelemetry: syncTel,
        deferBlockingDbWrites: true,
      });
    } catch {
      /* 세션 쿠키 동기 실패는 본문 응답에 영향 없음 */
    }
    const syncSessionMs = devPerfNow() - sync0;
    const emptyPerf = createEmptyMeProfilePipelinePerf();
    const total_route_ms = Math.round(devPerfNow() - tRoute0);
    logRoutePerf({
      route: "/api/me/profile",
      total_ms: total_route_ms,
      db_ms: 0,
      cache_hit: 1,
      auth_ms: Math.round(requireAuthMs),
      serialize_ms: json_payload_serialize_probe_ms,
        prod_profile_response_cache_lookup_ms,
    });
    finalizeMeProfileGetPerfLog(
      {
        auth_session_ms: Math.round(requireAuthMs),
        profile_query_ms: 0,
        store_query_ms: 0,
        badge_query_ms: 0,
        supabase_query_ms: 0,
        payload_build_ms: 0,
        quota_ms: Math.round(quotaMs),
        sync_session_ms: Math.round(syncSessionMs),
        total_route_ms,
        api_total_wall_ms: total_route_ms,
        api_handler_only_ms: Math.max(0, total_route_ms - Math.round(requireAuthMs) - Math.round(quotaMs)),
        api_compile_ms: 0,
        api_render_ms,
        next_dev_compile_detected: 0,
        route_client_ms: 0,
        get_user_ms: 0,
        profile_pipeline_ms: 0,
        profile_pipeline_total_ms: 0,
        dev_profile_cache_hit: 0,
        profile_singleflight_hit: 0,
        profile_cache_ttl_ms: PROFILE_ROUTE_PIPELINE_COALESCE_MS,
        get_user_call_count: 0,
        profile_query_call_count: 0,
        profile_response_cache_hit: 1,
        profile_response_cache_ttl_ms: PROFILE_PROD_RESPONSE_CACHE_TTL_MS,
        profile_response_cache_age_ms: responseCacheAgeMs,
        profile_response_cache_lookup_ms: prod_profile_response_cache_lookup_ms,
        profile_response_cache_store_ms: 0,
        json_payload_serialize_probe_ms,
        sync_prefetch_profile_ms: Math.round(syncPhase.sync_prefetch_profile_ms ?? 0),
        sync_profiles_update_ms: Math.round(syncPhase.sync_profiles_update_ms ?? 0),
        sync_registry_ms: Math.round(syncPhase.sync_registry_ms ?? 0),
        sync_cookie_ms: Math.round(syncPhase.sync_cookie_ms ?? 0),
        sync_profiles_update_skipped: syncTel.sync_profiles_update_skipped,
        sync_profiles_update_executed: syncTel.sync_profiles_update_executed,
        sync_registry_sync_skipped: syncTel.sync_registry_sync_skipped,
        sync_registry_sync_executed: syncTel.sync_registry_sync_executed,
        sync_last_login_age_ms: syncTel.sync_last_login_age_ms,
        sync_same_session_id: syncTel.sync_same_session_id,
        sync_same_device_info: syncTel.sync_same_device_info,
        ...syncTelemetryPerfNumbers(syncTel),
        profile_fetch_attempt_count: 0,
        profile_fetch_fallback_count: 0,
        profile_fetch_total_ms: 0,
        ...extractEnsureProfileNumericPhases(emptyPerf),
      },
      {
        profile_select_columns: "(profile_response_cache_prod)",
        profile_pipeline_steps: buildProfilePipelineStepsJson(emptyPerf),
        slowest_profile_step: "none",
        slowest_profile_step_ms: 0,
        profile_response_cache_reason: "hit_prod_ttl",
        profile_response_cache_key: prodProfilePeek.cache_key,
        profile_response_cache_bypass_reason: "",
        sync_touch_reason: syncTel.sync_touch_reason,
        ...syncTelemetryPerfExtras(syncTel),
        profile_fetch_mode: mode,
        ensure_profile_result: emptyPerf.ensure_profile_result || "n/a",
        compile_vs_render_note:
          "route_handler_does_not_measure_webpack_compile_ms; compare_total_route_ms_dev_vs_npm_start",
      },
    );
    return res;
  }

  const tRespPeek0 = devPerfNow();
  const responseCachePeek = bypassRouteCache
    ? ({
        hit: false as const,
        reason: "miss" as const,
        cache_key: `${userId.trim()}\0${mode}`,
      })
    : peekMeProfileGetResponseCacheDetailed(userId, mode);
  const profile_response_cache_lookup_ms = Math.round(devPerfNow() - tRespPeek0);
  const profileResponseCacheBypassReason = bypassRouteCache
    ? "bypass_query"
    : responseCachePeek.hit
      ? ""
      : responseCachePeek.reason;
  const profileResponseCacheKey = responseCachePeek.cache_key;

  if (responseCachePeek.hit) {
    const responseCacheAgeMs = Math.round(Date.now() - responseCachePeek.storedAt);
    const syncTel = emptySyncTelemetry();
    const body = { ok: true, profile: responseCachePeek.profile };
    let json_payload_serialize_probe_ms = 0;
    if (process.env.NODE_ENV === "development") {
      const j0 = devPerfNow();
      JSON.stringify(body);
      json_payload_serialize_probe_ms = Math.round(devPerfNow() - j0);
    }
    const r0 = devPerfNow();
    const res = NextResponse.json(body);
    const api_render_ms = Math.round(devPerfNow() - r0);
    const syncPhase: Partial<
      Record<
        "sync_prefetch_profile_ms" | "sync_profiles_update_ms" | "sync_registry_ms" | "sync_cookie_ms",
        number
      >
    > = {};
    const sync0 = devPerfNow();
    try {
      await syncActiveSessionForUser(userId, res, {
        rotate: false,
        sessionMeta: buildRequestSessionMeta(request),
        loginIdentifier: responseCachePeek.profile.auth_login_email ?? responseCachePeek.profile.email ?? null,
        request,
        existingProfile: responseCachePeek.profile,
        touchProfileThrottleSeconds: ME_PROFILE_GET_SESSION_TOUCH_THROTTLE_SEC,
        devSyncPhaseMs: syncPhase,
        syncTelemetry: syncTel,
        deferBlockingDbWrites: true,
      });
    } catch {
      /* 세션 쿠키 동기 실패는 본문 응답에 영향 없음 */
    }
    const syncSessionMs = devPerfNow() - sync0;
    const emptyPerf = createEmptyMeProfilePipelinePerf();
    const total_route_ms = Math.round(devPerfNow() - tRoute0);
    setProfileResponseCache(userId, mode, responseCachePeek.profile);
    logRoutePerf({
      route: "/api/me/profile",
      total_ms: total_route_ms,
      db_ms: 0,
      cache_hit: 1,
      auth_ms: Math.round(requireAuthMs),
      serialize_ms: json_payload_serialize_probe_ms,
    });
    finalizeMeProfileGetPerfLog(
      {
        auth_session_ms: Math.round(requireAuthMs),
        profile_query_ms: 0,
        store_query_ms: 0,
        badge_query_ms: 0,
        supabase_query_ms: 0,
        payload_build_ms: 0,
        quota_ms: Math.round(quotaMs),
        sync_session_ms: Math.round(syncSessionMs),
        total_route_ms,
        api_total_wall_ms: total_route_ms,
        api_handler_only_ms: Math.max(0, total_route_ms - Math.round(requireAuthMs) - Math.round(quotaMs)),
        api_compile_ms: 0,
        api_render_ms,
        next_dev_compile_detected: 0,
        route_client_ms: 0,
        get_user_ms: 0,
        profile_pipeline_ms: 0,
        profile_pipeline_total_ms: 0,
        dev_profile_cache_hit: 0,
        profile_singleflight_hit: 0,
        profile_cache_ttl_ms: PROFILE_ROUTE_PIPELINE_COALESCE_MS,
        get_user_call_count: 0,
        profile_query_call_count: 0,
        profile_response_cache_hit: 1,
        profile_response_cache_ttl_ms: ME_PROFILE_RESPONSE_CACHE_TTL_MS,
        profile_response_cache_age_ms: responseCacheAgeMs,
        profile_response_cache_lookup_ms,
        profile_response_cache_store_ms: 0,
        json_payload_serialize_probe_ms,
        sync_prefetch_profile_ms: Math.round(syncPhase.sync_prefetch_profile_ms ?? 0),
        sync_profiles_update_ms: Math.round(syncPhase.sync_profiles_update_ms ?? 0),
        sync_registry_ms: Math.round(syncPhase.sync_registry_ms ?? 0),
        sync_cookie_ms: Math.round(syncPhase.sync_cookie_ms ?? 0),
        sync_profiles_update_skipped: syncTel.sync_profiles_update_skipped,
        sync_profiles_update_executed: syncTel.sync_profiles_update_executed,
        sync_registry_sync_skipped: syncTel.sync_registry_sync_skipped,
        sync_registry_sync_executed: syncTel.sync_registry_sync_executed,
        sync_last_login_age_ms: syncTel.sync_last_login_age_ms,
        sync_same_session_id: syncTel.sync_same_session_id,
        sync_same_device_info: syncTel.sync_same_device_info,
        ...syncTelemetryPerfNumbers(syncTel),
        profile_fetch_attempt_count: 0,
        profile_fetch_fallback_count: 0,
        profile_fetch_total_ms: 0,
        ...extractEnsureProfileNumericPhases(emptyPerf),
      },
      {
        profile_select_columns: "(response_route_cache)",
        profile_pipeline_steps: buildProfilePipelineStepsJson(emptyPerf),
        slowest_profile_step: "none",
        slowest_profile_step_ms: 0,
        profile_response_cache_reason: "hit",
        profile_response_cache_key: profileResponseCacheKey,
        profile_response_cache_bypass_reason: profileResponseCacheBypassReason,
        sync_touch_reason: syncTel.sync_touch_reason,
        ...syncTelemetryPerfExtras(syncTel),
        profile_fetch_mode: mode,
        ensure_profile_result: emptyPerf.ensure_profile_result || "n/a",
        compile_vs_render_note:
          "route_handler_does_not_measure_webpack_compile_ms; compare_total_route_ms_dev_vs_npm_start",
      },
    );
    return res;
  }

  const cached =
    bypassRouteCache || mode === "lite" ? undefined : peekMeProfileGetRouteCache(userId);
  if (cached !== undefined) {
    const body = { ok: true, profile: cached };
    let json_payload_serialize_probe_ms = 0;
    if (process.env.NODE_ENV === "development") {
      const j0 = devPerfNow();
      JSON.stringify(body);
      json_payload_serialize_probe_ms = Math.round(devPerfNow() - j0);
    }
    const r0 = devPerfNow();
    const res = NextResponse.json(body);
    const api_render_ms = Math.round(devPerfNow() - r0);
    const syncTel = emptySyncTelemetry();
    const syncPhase: Partial<
      Record<
        "sync_prefetch_profile_ms" | "sync_profiles_update_ms" | "sync_registry_ms" | "sync_cookie_ms",
        number
      >
    > = {};
    const sync0 = devPerfNow();
    if (cached) {
      try {
        await syncActiveSessionForUser(userId, res, {
          rotate: false,
          sessionMeta: buildRequestSessionMeta(request),
          loginIdentifier: cached.auth_login_email ?? cached.email ?? null,
          request,
          existingProfile: cached,
          touchProfileThrottleSeconds: ME_PROFILE_GET_SESSION_TOUCH_THROTTLE_SEC,
          devSyncPhaseMs: syncPhase,
          syncTelemetry: syncTel,
          deferBlockingDbWrites: true,
        });
      } catch {
        /* 세션 쿠키 동기 실패는 본문 응답에 영향 없음 — 기존 POST ensure 와 동일 */
      }
    }
    const syncSessionMs = devPerfNow() - sync0;
    const emptyPerf = createEmptyMeProfilePipelinePerf();
    const total_route_ms = Math.round(devPerfNow() - tRoute0);
    if (cached) {
      setProfileResponseCache(userId, mode, cached);
    }
    logRoutePerf({
      route: "/api/me/profile",
      total_ms: total_route_ms,
      db_ms: 0,
      cache_hit: cached ? 1 : 0,
      auth_ms: Math.round(requireAuthMs),
      serialize_ms: json_payload_serialize_probe_ms,
    });
    finalizeMeProfileGetPerfLog(
      {
        auth_session_ms: Math.round(requireAuthMs),
        profile_query_ms: 0,
        store_query_ms: 0,
        badge_query_ms: 0,
        supabase_query_ms: 0,
        payload_build_ms: 0,
        quota_ms: Math.round(quotaMs),
        sync_session_ms: Math.round(syncSessionMs),
        total_route_ms,
        api_total_wall_ms: total_route_ms,
        api_handler_only_ms: Math.max(0, total_route_ms - Math.round(requireAuthMs) - Math.round(quotaMs)),
        api_compile_ms: 0,
        api_render_ms,
        next_dev_compile_detected: 0,
        route_client_ms: 0,
        get_user_ms: 0,
        profile_pipeline_ms: 0,
        profile_pipeline_total_ms: 0,
        dev_profile_cache_hit: 1,
        profile_singleflight_hit: 0,
        profile_cache_ttl_ms: PROFILE_ROUTE_PIPELINE_COALESCE_MS,
        get_user_call_count: 0,
        profile_query_call_count: 0,
        profile_response_cache_hit: 0,
        profile_response_cache_ttl_ms: ME_PROFILE_RESPONSE_CACHE_TTL_MS,
        profile_response_cache_age_ms: 0,
        profile_response_cache_lookup_ms,
        profile_response_cache_store_ms: 0,
        json_payload_serialize_probe_ms,
        sync_prefetch_profile_ms: Math.round(syncPhase.sync_prefetch_profile_ms ?? 0),
        sync_profiles_update_ms: Math.round(syncPhase.sync_profiles_update_ms ?? 0),
        sync_registry_ms: Math.round(syncPhase.sync_registry_ms ?? 0),
        sync_cookie_ms: Math.round(syncPhase.sync_cookie_ms ?? 0),
        sync_profiles_update_skipped: syncTel.sync_profiles_update_skipped,
        sync_profiles_update_executed: syncTel.sync_profiles_update_executed,
        sync_registry_sync_skipped: syncTel.sync_registry_sync_skipped,
        sync_registry_sync_executed: syncTel.sync_registry_sync_executed,
        sync_last_login_age_ms: syncTel.sync_last_login_age_ms,
        sync_same_session_id: syncTel.sync_same_session_id,
        sync_same_device_info: syncTel.sync_same_device_info,
        ...syncTelemetryPerfNumbers(syncTel),
        profile_fetch_attempt_count: 0,
        profile_fetch_fallback_count: 0,
        profile_fetch_total_ms: 0,
        ...extractEnsureProfileNumericPhases(emptyPerf),
      },
      {
        profile_select_columns: "(dev_route_cache)",
        profile_pipeline_steps: buildProfilePipelineStepsJson(emptyPerf),
        slowest_profile_step: "none",
        slowest_profile_step_ms: 0,
        profile_response_cache_reason: "bypass_dev_route_cache_branch",
        profile_response_cache_key: profileResponseCacheKey,
        profile_response_cache_bypass_reason: profileResponseCacheBypassReason || "n/a",
        sync_touch_reason: syncTel.sync_touch_reason,
        ...syncTelemetryPerfExtras(syncTel),
        profile_fetch_mode: mode,
        ensure_profile_result: emptyPerf.ensure_profile_result || "n/a",
        compile_vs_render_note:
          "route_handler_does_not_measure_webpack_compile_ms; compare_total_route_ms_dev_vs_npm_start",
      },
    );
    return res;
  }

  if (!cookieAuth.supabase) {
    return serviceUnavailable("Supabase 가 설정되지 않았습니다.");
  }

  let getUserCallCount = 0;
  let getUserMs = 0;
  let supabaseUser = cookieAuth.user;
  if (cookieAuth.claimsOnly) {
    const g0 = devPerfNow();
    const {
      data: { user },
    } = await cookieAuth.supabase.auth.getUser();
    getUserMs = devPerfNow() - g0;
    getUserCallCount = 1;
    supabaseUser = user?.id === userId ? user : null;
  } else {
    getUserCallCount = cookieAuth.user ? 1 : 0;
  }

  const serviceSb = tryCreateSupabaseServiceClient();
  const pipelineFlightKey = `${userId.trim()}\0${mode}`;
  let profileSingleflightHit = 0;
  const existingFlight = ME_PROFILE_PIPELINE_INFLIGHT.get(pipelineFlightKey);
  let flightPromise: Promise<MeProfilePipelineFlight>;
  if (existingFlight) {
    profileSingleflightHit = 1;
    flightPromise = existingFlight;
  } else {
    flightPromise = (async (): Promise<MeProfilePipelineFlight> => {
      const profileFetchMetrics = createEmptyProfileFetchMetrics();
      const pipelineStepMs = createEmptyMeProfilePipelinePerf();
      const pipe0 = devPerfNow();
      const profile = await runMeProfileReadPipeline({
        authUserId: userId,
        supabaseUser,
        routeSb: cookieAuth.supabase!,
        serviceSb,
        profileFetchMetrics,
        profileSelectMode: mode,
        pipelineStepMs,
      });
      return {
        profile,
        profilePipelineMs: devPerfNow() - pipe0,
        profileFetchMetrics,
        pipelineStepMs,
      };
    })();
    ME_PROFILE_PIPELINE_INFLIGHT.set(pipelineFlightKey, flightPromise);
    void flightPromise.finally(() => {
      ME_PROFILE_PIPELINE_INFLIGHT.delete(pipelineFlightKey);
    });
  }

  const flight = await flightPromise;
  const { profile, profilePipelineMs, profileFetchMetrics, pipelineStepMs } = flight;

  if (mode === "full") {
    setMeProfileGetRouteCache(userId, profile);
  }
  let profile_response_cache_store_ms = 0;
  if (profile) {
    const st0 = devPerfNow();
    setMeProfileGetResponseCache(userId, mode, profile);
    profile_response_cache_store_ms = Math.round(devPerfNow() - st0);
  }

  const syncTelMain = emptySyncTelemetry();
  const body = { ok: true, profile };
  let json_payload_serialize_probe_ms = 0;
  if (process.env.NODE_ENV === "development") {
    const j0 = devPerfNow();
    JSON.stringify(body);
    json_payload_serialize_probe_ms = Math.round(devPerfNow() - j0);
  }
  const r0 = devPerfNow();
  const res = NextResponse.json(body);
  const api_render_ms = Math.round(devPerfNow() - r0);
  const syncPhase: Partial<
    Record<
      "sync_prefetch_profile_ms" | "sync_profiles_update_ms" | "sync_registry_ms" | "sync_cookie_ms",
      number
    >
  > = {};
  const sync0 = devPerfNow();
  if (profile) {
    try {
      await syncActiveSessionForUser(userId, res, {
        rotate: false,
        sessionMeta: buildRequestSessionMeta(request),
        loginIdentifier: profile.auth_login_email ?? profile.email ?? null,
        request,
        existingProfile: profile,
        touchProfileThrottleSeconds: ME_PROFILE_GET_SESSION_TOUCH_THROTTLE_SEC,
        devSyncPhaseMs: syncPhase,
        syncTelemetry: syncTelMain,
        deferBlockingDbWrites: true,
      });
    } catch {
      /* 세션 쿠키 동기 실패는 본문 응답에 영향 없음 — 기존 POST ensure 와 동일 */
    }
  }
  const syncSessionMs = devPerfNow() - sync0;

  const m = profileFetchMetrics;
  const selCols =
    m.profileSelectColumns.trim() || (profile ? "(pipeline_no_fetch_metrics)" : "(null)");

  const slow = slowestProfilePipelineStep(pipelineStepMs);

  const total_route_ms = Math.round(devPerfNow() - tRoute0);
  if (profile) {
    setProfileResponseCache(userId, mode, profile);
  }
  logRoutePerf({
    route: "/api/me/profile",
    total_ms: total_route_ms,
    db_ms: Math.round(profilePipelineMs),
    cache_hit: 0,
    auth_ms: Math.round(requireAuthMs),
    serialize_ms: json_payload_serialize_probe_ms,
  });
  finalizeMeProfileGetPerfLog(
    {
      auth_session_ms: Math.round(requireAuthMs),
      route_client_ms: 0,
      get_user_ms: Math.round(getUserMs),
      profile_pipeline_ms: Math.round(profilePipelineMs),
      profile_pipeline_total_ms: Math.round(pipelineStepMs.pipeline_total_ms),
      quota_ms: Math.round(quotaMs),
      sync_session_ms: Math.round(syncSessionMs),
      supabase_query_ms: Math.round(profilePipelineMs),
      profile_query_ms: Math.round(profilePipelineMs),
      store_query_ms: 0,
      badge_query_ms: 0,
      payload_build_ms: Math.round(profilePipelineMs),
      total_route_ms,
      api_total_wall_ms: total_route_ms,
      api_handler_only_ms: Math.max(0, total_route_ms - Math.round(requireAuthMs) - Math.round(quotaMs)),
      api_compile_ms: 0,
      api_render_ms,
      next_dev_compile_detected: 0,
      dev_profile_cache_hit: 0,
      profile_singleflight_hit: profileSingleflightHit,
      profile_cache_ttl_ms: PROFILE_ROUTE_PIPELINE_COALESCE_MS,
      get_user_call_count: getUserCallCount,
      profile_query_call_count: m.profileQueryCallCount,
      profile_response_cache_hit: 0,
      profile_response_cache_ttl_ms: ME_PROFILE_RESPONSE_CACHE_TTL_MS,
      profile_response_cache_age_ms: 0,
      profile_response_cache_lookup_ms,
      profile_response_cache_store_ms,
      json_payload_serialize_probe_ms,
      ensure_user_profile_ms: Math.round(pipelineStepMs.ensure_user_profile_ms),
      ...extractEnsureProfileNumericPhases(pipelineStepMs),
      profile_row_fetch_ms: Math.round(pipelineStepMs.profile_row_fetch_ms),
      profile_row_normalize_ms: Math.round(pipelineStepMs.profile_row_normalize_ms),
      profile_row_fallback_ms: Math.round(pipelineStepMs.profile_row_fallback_ms),
      profile_quota_ms: Math.round(pipelineStepMs.profile_quota_ms),
      profile_session_sync_ms: Math.round(pipelineStepMs.profile_session_sync_ms),
      profile_payload_build_ms: Math.round(pipelineStepMs.profile_payload_build_ms),
      profile_extra_store_badge_ms: Math.round(pipelineStepMs.profile_extra_store_badge_ms),
      profile_extra_settings_ms: Math.round(pipelineStepMs.profile_extra_settings_ms),
      profile_rls_or_postgrest_wait_ms: Math.round(pipelineStepMs.profile_rls_or_postgrest_wait_ms),
      sync_prefetch_profile_ms: Math.round(syncPhase.sync_prefetch_profile_ms ?? 0),
      sync_profiles_update_ms: Math.round(syncPhase.sync_profiles_update_ms ?? 0),
      sync_registry_ms: Math.round(syncPhase.sync_registry_ms ?? 0),
      sync_cookie_ms: Math.round(syncPhase.sync_cookie_ms ?? 0),
      sync_profiles_update_skipped: syncTelMain.sync_profiles_update_skipped,
      sync_profiles_update_executed: syncTelMain.sync_profiles_update_executed,
      sync_registry_sync_skipped: syncTelMain.sync_registry_sync_skipped,
      sync_registry_sync_executed: syncTelMain.sync_registry_sync_executed,
      sync_last_login_age_ms: syncTelMain.sync_last_login_age_ms,
      sync_same_session_id: syncTelMain.sync_same_session_id,
      sync_same_device_info: syncTelMain.sync_same_device_info,
      ...syncTelemetryPerfNumbers(syncTelMain),
      profile_fetch_attempt_count: m.profile_fetch_attempt_count,
      profile_fetch_fallback_count: m.profile_fetch_fallback_count,
      profile_fetch_schema_retry_count: m.profile_fetch_schema_retry_count,
      profile_fetch_total_ms: Math.round(m.profile_fetch_total_ms),
      profile_fetch_first_success_ms: Math.round(m.profile_fetch_first_success_ms),
      profile_fetch_last_attempt_ms: Math.round(m.profile_fetch_last_attempt_ms),
    },
    {
      profile_select_columns: selCols,
      profile_pipeline_steps: buildProfilePipelineStepsJson(pipelineStepMs),
      slowest_profile_step: slow.step,
      slowest_profile_step_ms: Math.round(slow.ms),
      profile_response_cache_reason: "miss_pipeline_branch",
      profile_response_cache_key: profileResponseCacheKey,
      profile_response_cache_bypass_reason: profileResponseCacheBypassReason || "n/a",
      sync_touch_reason: profile ? syncTelMain.sync_touch_reason : "no_profile_after_pipeline",
      ...syncTelemetryPerfExtras(syncTelMain),
      profile_fetch_mode: mode,
      profile_fetch_last_schema_error_snippet: m.profile_fetch_last_schema_error_snippet || "",
      profile_fetch_first_attempt_ok:
        m.profile_fetch_attempt_count === 1 &&
        m.profile_fetch_fallback_count === 0 &&
        m.profile_fetch_schema_retry_count === 0
          ? "yes"
          : "no",
      compile_vs_render_note:
        "route_handler_does_not_measure_webpack_compile_ms; compare_total_route_ms_dev_vs_npm_start",
      ensure_profile_result: pipelineStepMs.ensure_profile_result || "n/a",
      ...ensureProfileDiagForDevPerf(pipelineStepMs),
    },
  );
  return res;
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  clearMeProfileGetRouteCache(auth.userId);
  clearMeProfileResponseCachesForUser(auth.userId);
  clearProfileResponseCacheForUser(auth.userId);

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

  const existingCompletionRow = await fetchProfileCompletionRow(auth.userId);
  applyProfileCompletedFromMergedRow(parsed.patch, existingCompletionRow);

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
