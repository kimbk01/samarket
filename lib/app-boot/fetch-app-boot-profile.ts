/**
 * App Boot Layer — `GET /api/me/profile?lite=1` 단일 비행 (서버 `profileSelectMode: lite`).
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { isGuestAuthEstablished, logGuestFetchSkipped } from "@/lib/auth/guest-auth-state";
import type { MeProfileGetResult } from "@/lib/profile/fetch-me-profile-deduped";
import { recordBootVerifyFetch } from "@/lib/app-boot/client-boot-request-journal";
import { logShellFetchTrace } from "@/lib/dibay/shell-fetch-trace";

/** Shared with `fetchMeProfileFullBackground` — wait instead of parallel lite+full. */
export const APP_BOOT_PROFILE_MINIMAL_FLIGHT = "app-boot:profile:minimal" as const;
const BOOT_MINIMAL_FLIGHT = APP_BOOT_PROFILE_MINIMAL_FLIGHT;
const BOOT_MINIMAL_TTL_MS = 4_000;

let cached: { expiresAt: number; value: MeProfileGetResult } | null = null;

export function invalidateAppBootProfileCache(): void {
  cached = null;
  forgetSingleFlight(BOOT_MINIMAL_FLIGHT);
}

export function peekAppBootProfileFetchCached(): MeProfileGetResult | null {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return null;
}

export function isAppBootProfileCacheFresh(): boolean {
  return !!cached && cached.expiresAt > Date.now();
}

export function fetchAppBootProfileMinimal(): Promise<MeProfileGetResult> {
  const now = Date.now();
  if (isGuestAuthEstablished()) {
    logGuestFetchSkipped("GET:/api/me/profile?lite=1", "fetchAppBootProfileMinimal");
    const guestResult: MeProfileGetResult = { status: 401, json: { ok: false, authenticated: false } };
    if (cached && cached.expiresAt > now && cached.value.status === 401) {
      return Promise.resolve(cached.value);
    }
    cached = { value: guestResult, expiresAt: now + BOOT_MINIMAL_TTL_MS };
    return Promise.resolve(guestResult);
  }
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return runSingleFlight(BOOT_MINIMAL_FLIGHT, () => {
    recordBootVerifyFetch("/api/me/profile?lite=1", "app_boot_minimal");
    logShellFetchTrace({
      api: "/api/me/profile",
      component: "fetch-app-boot-profile",
      reason: "fetchAppBootProfileMinimal_network",
    });
    return fetch("/api/me/profile?lite=1", {
      credentials: "include",
      cache: "no-store",
      headers: {
        "x-samarket-client-call-source": "app_boot_minimal",
        "x-samarket-surface": "app_boot",
        "x-samarket-first-paint-blocking": "1",
      },
    });
  }).then(async (res): Promise<MeProfileGetResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result: MeProfileGetResult = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 403) {
      cached = { value: result, expiresAt: Date.now() + BOOT_MINIMAL_TTL_MS };
    }
    return result;
  });
}
