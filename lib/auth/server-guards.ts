import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  cookieSecureFromNextHeaders,
  cookieSecureFromNextRequest,
} from "@/lib/auth/cookie-secure-flag";
import {
  readActiveSessionIdCookie,
  setActiveSessionCookie,
  createActiveSessionId,
  clearActiveSessionCookie,
} from "@/lib/auth/active-session";
import { isPrivilegedAdminAuthority } from "@/lib/auth/admin-policy";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { RequestSessionMeta } from "@/lib/auth/request-device-info";
import {
  isDeletedStoreMember,
  STORE_PHONE_GATE_MESSAGE,
} from "@/lib/auth/store-member-policy";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import {
  emptyAuthHotPathBreakdown,
  logAuthHotPathBreakdown,
  type AuthHotPathBreakdown,
} from "@/lib/auth/auth-hot-path-breakdown";
import {
  peekAuthLightSessionSnapshot,
  setAuthLightSessionSnapshot,
} from "@/lib/auth/auth-light-session-snapshot-cache";
import {
  syncUserSessionRegistry,
  validateUserSessionRegistryCached,
  ensureUserSessionRegistryRow,
} from "@/lib/auth/user-session-registry";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { jsonError } from "@/lib/http/api-route";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import type { ProfileRow } from "@/lib/profile/types";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import {
  peekPhoneVerifiedPositiveProfile,
  rememberPhoneVerifiedPositiveProfile,
} from "@/lib/auth/phone-verified-positive-cache";

export async function requireAuth(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  return requireAuthenticatedUserId();
}

async function getProfileReader() {
  return tryCreateSupabaseServiceClient() ?? (await createSupabaseRouteHandlerClient());
}

export async function getCurrentProfile(userId: string): Promise<ProfileRow | null> {
  const sb = await getProfileReader();
  if (!sb) return null;
  const existing = await fetchProfileRowSafe(sb, userId);
  if (existing) return existing;
  if ("auth" in sb && "from" in sb) {
    return ensureProfileForUserId(sb as never, userId);
  }
  return null;
}

export async function validateActiveSession(
  userId: string,
  currentSessionId?: string | null
): Promise<{ ok: true; profile: ProfileRow } | { ok: false; response: NextResponse; profile?: ProfileRow | null }> {
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    return { ok: false, response: jsonError("프로필을 찾을 수 없습니다.", 404) };
  }
  if (isDeletedStoreMember(profile)) {
    return {
      ok: false,
      response: jsonError("탈퇴한 계정입니다. 다시 이용하려면 새로 가입해 주세요.", 403, {
        authenticated: false,
        code: "account_withdrawn",
      }),
      profile,
    };
  }
  const sessionId = (currentSessionId ?? (await readActiveSessionIdCookie()) ?? "").trim();
  if (!sessionId) {
    return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), profile };
  }
  const sb = tryCreateSupabaseServiceClient();
  if (sb) {
    let { ok: registryOk } = await validateUserSessionRegistryCached(sb, userId, sessionId);
    if (!registryOk) {
      const ensured = await ensureUserSessionRegistryRow(sb, userId, sessionId);
      if (ensured) {
        registryOk = true;
      }
    }
    if (!registryOk) {
      return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), profile };
    }
  } else if (!sessionId) {
    return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), profile };
  }
  return { ok: true, profile };
}

/**
 * `GET /api/auth/session` 등 경량 검증 — `profiles` 전체 행 대신 `active_session_id` 만 조회.
 */
export async function validateActiveSessionLight(
  userId: string,
  currentSessionId?: string | null,
  opts?: { route?: string; logBreakdown?: boolean }
): Promise<{ ok: true; breakdown?: AuthHotPathBreakdown } | { ok: false; response: NextResponse; breakdown?: AuthHotPathBreakdown }> {
  const total0 = devPerfNow();
  const breakdown = emptyAuthHotPathBreakdown();
  const cacheLookup0 = devPerfNow();
  breakdown.auth_cache_lookup_ms = Math.round(devPerfNow() - cacheLookup0);

  const cookie0 = devPerfNow();
  const sessionId = (currentSessionId ?? (await readActiveSessionIdCookie()) ?? "").trim();
  breakdown.auth_cookie_parse_ms = Math.round(devPerfNow() - cookie0);

  if (!sessionId) {
    breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
    if (opts?.logBreakdown) logAuthHotPathBreakdown({ ...breakdown, route: opts.route, phase: "light" });
    return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), breakdown };
  }

  const snap = peekAuthLightSessionSnapshot(userId, sessionId);
  if (snap.hit) {
    breakdown.auth_cache_hit = 1;
    breakdown.auth_same_session_hit = 1;
    breakdown.auth_ttl_remaining_ms = Math.round(snap.ttlRemainingMs);
    breakdown.auth_db_round_trips = 0;
    breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
    if (opts?.logBreakdown) {
      logAuthHotPathBreakdown({
        ...breakdown,
        route: opts.route,
        phase: "light_snapshot",
        auth_source: "light_snapshot",
      });
    }
    return { ok: true, breakdown };
  }

  const sbRead = tryCreateSupabaseServiceClient() ?? (await createSupabaseRouteHandlerClient());
  if (!sbRead) {
    breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
    return { ok: false, response: jsonError("인증 설정이 준비되지 않았습니다.", 503, { authenticated: false }), breakdown };
  }

  let activeSessionId = "";
  let dbTrips = 0;
  const sb = tryCreateSupabaseServiceClient();

  if (sb) {
    const [profileResult, registryResult] = await Promise.all([
      (async () => {
        const profile0 = devPerfNow();
        const { data: pr, error } = await sbRead
          .from("profiles")
          .select("active_session_id, status, deleted_at")
          .eq("id", userId)
          .maybeSingle();
        return {
          pr,
          error,
          ms: Math.round(devPerfNow() - profile0),
        };
      })(),
      (async () => {
        const reg0 = devPerfNow();
        const { ok: registryOk, cacheHit: regCacheHit } = await validateUserSessionRegistryCached(
          sb,
          userId,
          sessionId
        );
        return {
          registryOk,
          regCacheHit,
          ms: Math.round(devPerfNow() - reg0),
        };
      })(),
    ]);

    breakdown.auth_profile_sync_ms = profileResult.ms;
    breakdown.auth_registry_ms = registryResult.ms;
    dbTrips += 1;
    if (!registryResult.regCacheHit) dbTrips += 1;
    else breakdown.auth_cache_hit = 1;

    if (profileResult.error || !profileResult.pr) {
      breakdown.auth_db_round_trips = dbTrips;
      breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
      return { ok: false, response: jsonError("프로필을 찾을 수 없습니다.", 404), breakdown };
    }
    if (
      isDeletedStoreMember(
        profileResult.pr as { status?: string | null; deleted_at?: string | null }
      )
    ) {
      breakdown.auth_db_round_trips = dbTrips;
      breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
      return {
        ok: false,
        response: jsonError("탈퇴한 계정입니다. 다시 이용하려면 새로 가입해 주세요.", 403, {
          authenticated: false,
          code: "account_withdrawn",
        }),
        breakdown,
      };
    }
    activeSessionId = String(
      (profileResult.pr as { active_session_id?: string | null }).active_session_id ?? ""
    ).trim();

    if (!registryResult.registryOk) {
      const ensured = await ensureUserSessionRegistryRow(sb, userId, sessionId);
      if (!ensured) {
        breakdown.auth_db_round_trips = dbTrips;
        breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
        return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), breakdown };
      }
    }
  } else {
    breakdown.auth_profile_sync_ms = 0;
    dbTrips = 0;
  }

  setAuthLightSessionSnapshot(userId, sessionId, activeSessionId || sessionId);
  breakdown.auth_db_round_trips = dbTrips;
  breakdown.auth_validate_ms = Math.max(breakdown.auth_profile_sync_ms, breakdown.auth_registry_ms);
  breakdown.auth_total_ms = Math.round(devPerfNow() - total0);
  if (opts?.logBreakdown) logAuthHotPathBreakdown({ ...breakdown, route: opts.route, phase: "light" });
  return { ok: true, breakdown };
}

function profilePassesPhoneVerificationGate(
  profile: ProfileRow,
  privilegedAdmin?: boolean
): boolean {
  if (
    isPrivilegedAdminAuthority({
      role: profile.role,
      privilegedAdmin,
    })
  ) {
    return true;
  }
  return hasVerifiedPhone({
    role: profile.role,
    privilegedAdmin,
    phone_verified: profile.phone_verified === true,
    phone_verified_at: profile.phone_verified_at ?? null,
    phone_verification_method: profile.phone_verification_method ?? null,
    provider: profile.provider ?? profile.auth_provider,
    auth_provider: profile.auth_provider,
    email: profile.email,
  });
}

async function resolvePrivilegedAdminForUser(
  userId: string,
  profileRole: string | null | undefined
): Promise<boolean> {
  void profileRole;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return false;
  try {
    return await hasActiveAdminMembershipOrLegacyRole(sb, userId);
  } catch {
    return false;
  }
}

export async function requirePhoneVerified(
  userId: string
): Promise<{ ok: true; profile: ProfileRow } | { ok: false; response: NextResponse; profile?: ProfileRow | null }> {
  const cached = peekPhoneVerifiedPositiveProfile(userId);
  if (cached) {
    const privilegedCached = await resolvePrivilegedAdminForUser(userId, cached.role);
    if (profilePassesPhoneVerificationGate(cached, privilegedCached)) {
      return { ok: true, profile: cached };
    }
  }
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    return { ok: false, response: jsonError("프로필을 찾을 수 없습니다.", 404) };
  }
  const privilegedAdmin = await resolvePrivilegedAdminForUser(userId, profile.role);
  if (profilePassesPhoneVerificationGate(profile, privilegedAdmin)) {
    rememberPhoneVerifiedPositiveProfile(userId, profile);
    return { ok: true, profile };
  }
  return {
    ok: false,
    response: jsonError(STORE_PHONE_GATE_MESSAGE, {
      status: 403,
      code: "PHONE_VERIFICATION_REQUIRED",
    }),
    profile,
  };
}

export async function requireAdmin(
  userId: string
): Promise<{ ok: true; profile: ProfileRow } | { ok: false; response: NextResponse; profile?: ProfileRow | null }> {
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    return { ok: false, response: jsonError("프로필을 찾을 수 없습니다.", 404) };
  }
  // Application authority: active admin_memberships ONLY (no profiles.role fallback)
  const sb = tryCreateSupabaseServiceClient();
  if (sb) {
    try {
      if (await hasActiveAdminMembershipOrLegacyRole(sb, userId)) {
        return { ok: true, profile };
      }
    } catch {
      /* deny */
    }
  }
  return { ok: false, response: jsonError("관리자만 가능합니다.", 403), profile };
}

/** GET `/api/me/profile` 동일 세션·기기 시 profiles · registry 갱신 최소 간격(초). `last_login_at` 경과 기준. */
export const ME_PROFILE_GET_SESSION_TOUCH_THROTTLE_SEC = 300;

/** `syncActiveSessionForUser` 동작 분해 — `[dev-api-perf]` 용 */
export type SyncSessionTelemetry = {
  sync_profiles_update_skipped: 0 | 1;
  sync_profiles_update_executed: 0 | 1;
  sync_registry_sync_skipped: 0 | 1;
  sync_registry_sync_executed: 0 | 1;
  sync_touch_reason: string;
  /** `last_login_at` 이 없거나 파싱 불가면 -1 */
  sync_last_login_age_ms: number;
  sync_same_session_id: 0 | 1;
  sync_same_device_info: 0 | 1;
  /** 스로틀·분기 식별 — 예: `combined_max_300s_profile_300s_registry_300s` */
  sync_write_policy: string;
  /** 적용된 프로필 UPDATE 스로틀 창(ms). 미설정 시 0 */
  sync_profile_write_throttle_ms: number;
  /** 적용된 registry upsert 스로틀 창(ms). 미설정 시 프로필과 동일 정책이면 프로필 값과 같음 */
  sync_registry_write_throttle_ms: number;
  /** 시간·세션 정책상 프로필 갱신이 «필요한 시점»이면 1 (실행 여부와 별개) */
  sync_profile_write_due: 0 | 1;
  sync_registry_write_due: 0 | 1;
  sync_profile_write_skipped_reason: string;
  sync_registry_write_skipped_reason: string;
};

export async function syncActiveSessionForUser(
  userId: string,
  response: NextResponse,
  options?: {
    rotate?: boolean;
    sessionMeta?: RequestSessionMeta | null;
    loginIdentifier?: string | null;
    request?: NextRequest | null;
    /** 이미 로드된 `profiles` 행 — `getCurrentProfile()`(추가 select) 생략 */
    existingProfile?: ProfileRow | null;
    /** `profiles` 갱신 스로틀(초). `rotate===true` 일 때는 무시 */
    touchProfileThrottleSeconds?: number;
    /** `user_sessions` registry 갱신 스로틀(초). 생략 시 `touchProfileThrottleSeconds` 와 동일 */
    touchRegistryThrottleSeconds?: number;
    /** 개발 계측 — sync 구간별 ms */
    devSyncPhaseMs?: Partial<
      Record<
        "sync_prefetch_profile_ms" | "sync_profiles_update_ms" | "sync_registry_ms" | "sync_cookie_ms",
        number
      >
    >;
    /** sync UPDATE·registry 실행 여부 등 */
    syncTelemetry?: SyncSessionTelemetry;
    /** GET /api/me/profile 등: profiles UPDATE·registry 를 응답 전에 await 하지 않고 백그라운드 실행 */
    deferBlockingDbWrites?: boolean;
  }
): Promise<{ sessionId: string | null; profile: ProfileRow | null }> {
  const phase = options?.devSyncPhaseMs;
  const tel = options?.syncTelemetry;
  const sb = tryCreateSupabaseServiceClient();

  const tPre0 = devPerfNow();
  const profile =
    options && "existingProfile" in options ? options.existingProfile ?? null : await getCurrentProfile(userId);
  if (phase) {
    phase.sync_prefetch_profile_ms = (phase.sync_prefetch_profile_ms ?? 0) + Math.round(devPerfNow() - tPre0);
  }

  if (!profile) {
    if (tel) {
      tel.sync_touch_reason = "no_profile_row";
      tel.sync_last_login_age_ms = -1;
      tel.sync_same_session_id = 0;
      tel.sync_same_device_info = 0;
      tel.sync_profiles_update_skipped = 1;
      tel.sync_profiles_update_executed = 0;
      tel.sync_registry_sync_skipped = 1;
      tel.sync_registry_sync_executed = 0;
      tel.sync_write_policy = "none_no_profile";
      tel.sync_profile_write_throttle_ms = 0;
      tel.sync_registry_write_throttle_ms = 0;
      tel.sync_profile_write_due = 0;
      tel.sync_registry_write_due = 0;
      tel.sync_profile_write_skipped_reason = "no_profile_row";
      tel.sync_registry_write_skipped_reason = "no_profile_row";
    }
    return { sessionId: null, profile: null };
  }

  if (isDeletedStoreMember(profile)) {
    if (tel) {
      tel.sync_touch_reason = "withdrawn_member";
      tel.sync_profiles_update_skipped = 1;
      tel.sync_registry_sync_skipped = 1;
      tel.sync_profile_write_skipped_reason = "withdrawn_member";
      tel.sync_registry_write_skipped_reason = "withdrawn_member";
    }
    await clearActiveSessionCookie(response, options?.request
      ? cookieSecureFromNextRequest(options.request)
      : undefined);
    return { sessionId: null, profile: null };
  }

  const cookieSessionId = (await readActiveSessionIdCookie())?.trim() || null;
  const profileSessionId = (profile.active_session_id ?? "").trim() || null;
  const deviceNow = options?.sessionMeta?.deviceInfo?.trim() || null;
  const deviceDb = (profile.last_device_info ?? "").trim() || null;
  const sameDevice = (deviceNow ?? "") === (deviceDb ?? "");
  let nextSessionId: string;

  if (options?.rotate === true) {
    nextSessionId = createActiveSessionId();
  } else if (cookieSessionId) {
    nextSessionId = cookieSessionId;
  } else if (profileSessionId && (sameDevice || !deviceDb)) {
    // Cookie만 유실된 동일 기기(또는 device 미기록) — DB 세션 재사용. 타 기기 fresh login 은 새 id.
    nextSessionId = profileSessionId;
  } else {
    nextSessionId = createActiveSessionId();
  }

  const cookieSecure = options?.request
    ? cookieSecureFromNextRequest(options.request)
    : await cookieSecureFromNextHeaders();

  const profileThrottleSec = options?.touchProfileThrottleSeconds ?? 0;
  const registryThrottleSec =
    options?.touchRegistryThrottleSeconds !== undefined
      ? options.touchRegistryThrottleSeconds
      : profileThrottleSec;
  /** 두 스로틀 중 긴 쪽 — 단일 `last_login_at` 만 있으므로 동일 세션·기기에서는 둘 다 이 간격 안이면 생략 */
  const combinedThrottleSec = Math.max(profileThrottleSec, registryThrottleSec);

  const lastLoginRaw = profile.last_login_at;
  const lastLoginMs =
    typeof lastLoginRaw === "string" && lastLoginRaw.trim() ? Date.parse(lastLoginRaw) : Number.NaN;
  const lastLoginAgeMs = Number.isFinite(lastLoginMs) ? Math.max(0, Date.now() - lastLoginMs) : -1;
  const sessionAlreadyPersisted = Boolean(profileSessionId && profileSessionId === nextSessionId);
  const hasSessionForSkip = Boolean(cookieSessionId || profileSessionId);

  const profileAgeDue =
    profileThrottleSec > 0 && Number.isFinite(lastLoginMs) && lastLoginAgeMs >= profileThrottleSec * 1000;
  const registryAgeDue =
    registryThrottleSec > 0 && Number.isFinite(lastLoginMs) && lastLoginAgeMs >= registryThrottleSec * 1000;
  const immediateHeavyDue =
    options?.rotate === true || !sameDevice || !sessionAlreadyPersisted || !hasSessionForSkip;

  const combinedTouchOk =
    options?.rotate !== true &&
    combinedThrottleSec > 0 &&
    Number.isFinite(lastLoginMs) &&
    lastLoginAgeMs < combinedThrottleSec * 1000;

  const skipHeavyWrites =
    Boolean(sb) && combinedTouchOk && sessionAlreadyPersisted && sameDevice && hasSessionForSkip;

  if (tel) {
    tel.sync_last_login_age_ms = Math.round(lastLoginAgeMs);
    tel.sync_same_session_id = profileSessionId === nextSessionId ? 1 : 0;
    tel.sync_same_device_info = sameDevice ? 1 : 0;
    tel.sync_profile_write_throttle_ms = profileThrottleSec * 1000;
    tel.sync_registry_write_throttle_ms = registryThrottleSec * 1000;
    tel.sync_write_policy = `combined_max_${combinedThrottleSec}s_profile_${profileThrottleSec}s_registry_${registryThrottleSec}s`;
    tel.sync_profile_write_due = immediateHeavyDue || profileAgeDue ? 1 : 0;
    tel.sync_registry_write_due = immediateHeavyDue || registryAgeDue ? 1 : 0;
  }

  if (!sb) {
    if (tel) {
      tel.sync_profiles_update_skipped = 1;
      tel.sync_profiles_update_executed = 0;
      tel.sync_registry_sync_skipped = 1;
      tel.sync_registry_sync_executed = 0;
      tel.sync_touch_reason = "no_service_role_cookie_only";
      tel.sync_profile_write_skipped_reason = "no_service_role";
      tel.sync_registry_write_skipped_reason = "no_service_role";
    }
    const tc0 = devPerfNow();
    await setActiveSessionCookie(response, nextSessionId, cookieSecure);
    if (phase) {
      phase.sync_cookie_ms = (phase.sync_cookie_ms ?? 0) + Math.round(devPerfNow() - tc0);
    }
    return {
      sessionId: nextSessionId,
      profile: {
        ...profile,
        active_session_id: profileSessionId,
      },
    };
  }

  if (skipHeavyWrites) {
    if (tel) {
      tel.sync_profiles_update_skipped = 1;
      tel.sync_profiles_update_executed = 0;
      tel.sync_registry_sync_skipped = 1;
      tel.sync_registry_sync_executed = 0;
      tel.sync_touch_reason = "throttle_same_session_device";
      tel.sync_profile_write_skipped_reason = "throttle_same_session_device";
      tel.sync_registry_write_skipped_reason = "throttle_same_session_device";
      tel.sync_profile_write_due = 0;
      tel.sync_registry_write_due = 0;
    }
    const tc0 = devPerfNow();
    await setActiveSessionCookie(response, nextSessionId, cookieSecure);
    if (phase) {
      phase.sync_cookie_ms = (phase.sync_cookie_ms ?? 0) + Math.round(devPerfNow() - tc0);
    }
    return {
      sessionId: nextSessionId,
      profile: {
        ...profile,
        active_session_id: nextSessionId,
      },
    };
  }

  if (options?.deferBlockingDbWrites && sb && !skipHeavyWrites) {
    if (tel) {
      tel.sync_profiles_update_skipped = 1;
      tel.sync_profiles_update_executed = 0;
      tel.sync_registry_sync_skipped = 1;
      tel.sync_registry_sync_executed = 0;
      tel.sync_touch_reason = "deferred_fire_and_forget";
      tel.sync_profile_write_skipped_reason = "deferred_fire_and_forget";
      tel.sync_registry_write_skipped_reason = "deferred_fire_and_forget";
    }
    logRoutePerf({
      route: "/api/me/profile",
      phase: "sync_session_deferred_before",
      before_ms: 0,
      total_ms: 0,
      db_ms: 0,
      cache_hit: 0,
      auth_ms: 0,
      serialize_ms: 0,
    });
    const tcDeferCookie = devPerfNow();
    await setActiveSessionCookie(response, nextSessionId, cookieSecure);
    if (phase) {
      phase.sync_cookie_ms = (phase.sync_cookie_ms ?? 0) + Math.round(devPerfNow() - tcDeferCookie);
    }
    const sbCaptured = sb;
    const uid = userId;
    const sid = nextSessionId;
    const sm = options?.sessionMeta;
    const loginId =
      options?.loginIdentifier?.trim() || profile?.auth_login_email?.trim() || profile?.email?.trim() || null;
    const schedule = () => {
      void (async () => {
        const tBg0 = devPerfNow();
        try {
          const { error: profileUpdateError } = await sbCaptured
            .from("profiles")
            .update({
              active_session_id: sid,
              last_login_at: new Date().toISOString(),
              last_device_info: sm?.deviceInfo?.trim() || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", uid);
          if (profileUpdateError) {
            const m = String(profileUpdateError.message ?? "").toLowerCase();
            const schemaDrift =
              profileUpdateError.code === "42703" ||
              m.includes("schema cache") ||
              m.includes("could not find") ||
              m.includes("column") ||
              m.includes("active_session_id") ||
              m.includes("last_login_at") ||
              m.includes("last_device_info");
            if (!schemaDrift) {
              console.error("[syncActiveSessionForUser] deferred profile update", profileUpdateError.message);
            }
          }
          try {
            await syncUserSessionRegistry(sbCaptured, uid, {
              nextSessionId: sid,
              deviceInfo: sm?.deviceInfo?.trim() || null,
              loginIdentifier: loginId,
              deviceKey: sm?.deviceKey ?? null,
              browserKey: sm?.browserKey ?? null,
              ipAddress: sm?.ipAddress ?? null,
            });
          } catch {
            /* Session registry drift — login must not fail */
          }
          logRoutePerf({
            route: "/api/me/profile",
            phase: "sync_session_deferred_after",
            after_ms: Math.round(devPerfNow() - tBg0),
            total_ms: Math.round(devPerfNow() - tBg0),
            db_ms: Math.round(devPerfNow() - tBg0),
          });
        } catch (e) {
          console.error("[syncActiveSessionForUser] deferred", e);
        }
      })();
    };
    if (typeof setImmediate !== "undefined") setImmediate(schedule);
    else queueMicrotask(schedule);
    return {
      sessionId: nextSessionId,
      profile: {
        ...profile,
        active_session_id: nextSessionId,
        last_login_at: new Date().toISOString(),
        last_device_info: options?.sessionMeta?.deviceInfo?.trim() || null,
      },
    };
  }

  if (tel) {
    tel.sync_profiles_update_skipped = 0;
    tel.sync_profiles_update_executed = 1;
    tel.sync_touch_reason = options?.rotate === true ? "session_rotate_writes" : "profiles_and_registry_writes";
    tel.sync_profile_write_skipped_reason = "none_executed";
    tel.sync_registry_write_skipped_reason = "none_executed";
  }

  const tu0 = devPerfNow();
  const { error: profileUpdateError } = await sb
    .from("profiles")
    .update({
      active_session_id: nextSessionId,
      last_login_at: new Date().toISOString(),
      last_device_info: options?.sessionMeta?.deviceInfo?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (phase) {
    phase.sync_profiles_update_ms = (phase.sync_profiles_update_ms ?? 0) + Math.round(devPerfNow() - tu0);
  }
  if (profileUpdateError) {
    const m = String(profileUpdateError.message ?? "").toLowerCase();
    const schemaDrift =
      profileUpdateError.code === "42703" ||
      m.includes("schema cache") ||
      m.includes("could not find") ||
      m.includes("column") ||
      m.includes("active_session_id") ||
      m.includes("last_login_at") ||
      m.includes("last_device_info");
    if (!schemaDrift) {
      throw new Error(profileUpdateError.message || "active_session_profile_update_failed");
    }
  }
  try {
    const tr0 = devPerfNow();
    await syncUserSessionRegistry(sb, userId, {
      nextSessionId,
      deviceInfo: options?.sessionMeta?.deviceInfo?.trim() || null,
      loginIdentifier: options?.loginIdentifier?.trim() || profile?.auth_login_email?.trim() || profile?.email?.trim() || null,
      deviceKey: options?.sessionMeta?.deviceKey ?? null,
      browserKey: options?.sessionMeta?.browserKey ?? null,
      ipAddress: options?.sessionMeta?.ipAddress ?? null,
    });
    if (phase) {
      phase.sync_registry_ms = (phase.sync_registry_ms ?? 0) + Math.round(devPerfNow() - tr0);
    }
    if (tel) {
      tel.sync_registry_sync_skipped = 0;
      tel.sync_registry_sync_executed = 1;
    }
  } catch {
    if (tel) {
      tel.sync_registry_sync_skipped = 0;
      tel.sync_registry_sync_executed = 1;
    }
    // Session registry is an enforcement layer; login/profile ensure must not fail because of registry drift.
  }
  const tc0 = devPerfNow();
  await setActiveSessionCookie(response, nextSessionId, cookieSecure);
  if (phase) {
    phase.sync_cookie_ms = (phase.sync_cookie_ms ?? 0) + Math.round(devPerfNow() - tc0);
  }
  return {
    sessionId: nextSessionId,
    profile: {
      ...profile,
      active_session_id: nextSessionId,
      last_login_at: new Date().toISOString(),
      last_device_info: options?.sessionMeta?.deviceInfo?.trim() || null,
    },
  };
}
