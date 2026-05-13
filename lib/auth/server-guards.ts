import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  cookieSecureFromNextHeaders,
  cookieSecureFromNextRequest,
} from "@/lib/auth/cookie-secure-flag";
import {
  readActiveSessionIdCookie,
  sessionReplacedResponse,
  setActiveSessionCookie,
  createActiveSessionId,
} from "@/lib/auth/active-session";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import type { RequestSessionMeta } from "@/lib/auth/request-device-info";
import { hasPhilippinePhoneVerification, STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";
import { invalidateUserSessionRegistry, syncUserSessionRegistry, validateUserSessionRegistry } from "@/lib/auth/user-session-registry";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { jsonError } from "@/lib/http/api-route";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import type { ProfileRow } from "@/lib/profile/types";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

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
  const activeSessionId = (profile.active_session_id ?? "").trim();
  const sessionId = (currentSessionId ?? (await readActiveSessionIdCookie()) ?? "").trim();
  if (!sessionId) {
    return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), profile };
  }
  const sb = tryCreateSupabaseServiceClient();
  if (sb) {
    const registryOk = await validateUserSessionRegistry(sb, userId, sessionId);
    if (!registryOk) {
      if (activeSessionId && activeSessionId !== sessionId) {
        return { ok: false, response: sessionReplacedResponse(), profile };
      }
      // registry 기준으로는 유효 세션이 아님. 동일한 active_session_id라도 통과시키지 않는다.
      return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), profile };
    }
  } else {
    if (activeSessionId && activeSessionId !== sessionId) {
      return { ok: false, response: sessionReplacedResponse(), profile };
    }
    if (!activeSessionId && !sessionId) {
      return { ok: false, response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }), profile };
    }
  }
  return { ok: true, profile };
}

export async function requirePhoneVerified(
  userId: string
): Promise<{ ok: true; profile: ProfileRow } | { ok: false; response: NextResponse; profile?: ProfileRow | null }> {
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    return { ok: false, response: jsonError("프로필을 찾을 수 없습니다.", 404) };
  }
  if (isPrivilegedAdminRole(profile.role)) {
    return { ok: true, profile };
  }
  if (
    hasPhilippinePhoneVerification({
      role: profile.role,
      phone_verified: profile.phone_verified === true,
      phone_verified_at: profile.phone_verified_at ?? null,
      provider: profile.provider ?? profile.auth_provider,
      auth_provider: profile.auth_provider,
      email: profile.email,
    })
  ) {
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
  if (!isPrivilegedAdminRole(profile.role)) {
    return { ok: false, response: jsonError("관리자만 가능합니다.", 403), profile };
  }
  return { ok: true, profile };
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

  const cookieSessionId = (await readActiveSessionIdCookie())?.trim() || null;
  const profileSessionId = (profile.active_session_id ?? "").trim() || null;
  let nextSessionId: string;

  if (options?.rotate === true) {
    nextSessionId = createActiveSessionId();
  } else if (cookieSessionId) {
    nextSessionId = cookieSessionId;
  } else if (profileSessionId) {
    // Cookie만 유실된 경우 DB 세션을 재사용해 즉시 복구한다.
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

  const deviceNow = options?.sessionMeta?.deviceInfo?.trim() || null;
  const deviceDb = (profile.last_device_info ?? "").trim() || null;
  const sameDevice = (deviceNow ?? "") === (deviceDb ?? "");
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
