/**
 * App Boot Layer — `GET /api/me/profile?lite=1` 단일 비행 (서버 `profileSelectMode: lite`).
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import type { MeProfileGetResult } from "@/lib/profile/fetch-me-profile-deduped";
import { recordBootVerifyFetch } from "@/lib/app-boot/client-boot-request-journal";

const BOOT_MINIMAL_FLIGHT = "app-boot:profile:minimal" as const;
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
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return runSingleFlight(BOOT_MINIMAL_FLIGHT, () => {
    recordBootVerifyFetch("/api/me/profile?lite=1", "app_boot_minimal");
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
