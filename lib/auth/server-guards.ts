import { NextResponse } from "next/server";
import { readActiveSessionIdCookie, sessionReplacedResponse, setActiveSessionCookie, createActiveSessionId } from "@/lib/auth/active-session";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import type { RequestSessionMeta } from "@/lib/auth/request-device-info";
import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";
import { invalidateUserSessionRegistry, syncUserSessionRegistry, validateUserSessionRegistry } from "@/lib/auth/user-session-registry";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { jsonError } from "@/lib/http/api-route";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import type { ProfileRow } from "@/lib/profile/types";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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
  if (profile.status === "verified_user" && profile.phone_verified_at) {
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

export async function syncActiveSessionForUser(
  userId: string,
  response: NextResponse,
  options?: { rotate?: boolean; sessionMeta?: RequestSessionMeta | null; loginIdentifier?: string | null }
): Promise<{ sessionId: string | null; profile: ProfileRow | null }> {
  const sb = tryCreateSupabaseServiceClient();
  const profile = sb ? await getCurrentProfile(userId) : await getCurrentProfile(userId);
  if (!profile) {
    return { sessionId: null, profile };
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

  if (!sb) {
    setActiveSessionCookie(response, nextSessionId);
    return {
      sessionId: nextSessionId,
      profile: {
        ...profile,
        active_session_id: profileSessionId,
      },
    };
  }

  const { error: profileUpdateError } = await sb
    .from("profiles")
    .update({
      active_session_id: nextSessionId,
      last_login_at: new Date().toISOString(),
      last_device_info: options?.sessionMeta?.deviceInfo?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
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
    await syncUserSessionRegistry(sb, userId, {
      nextSessionId,
      deviceInfo: options?.sessionMeta?.deviceInfo?.trim() || null,
      loginIdentifier: options?.loginIdentifier?.trim() || profile?.auth_login_email?.trim() || profile?.email?.trim() || null,
      deviceKey: options?.sessionMeta?.deviceKey ?? null,
      browserKey: options?.sessionMeta?.browserKey ?? null,
      ipAddress: options?.sessionMeta?.ipAddress ?? null,
    });
  } catch {
    // Session registry is an enforcement layer; login/profile ensure must not fail because of registry drift.
  }
  setActiveSessionCookie(response, nextSessionId);
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
