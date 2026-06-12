/**
 * GET /api/me/profile — RegionProvider·getMyProfile·내정보 등 동시 호출 시 한 번으로 합침.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { recordBootVerifyFetch } from "@/lib/app-boot/client-boot-request-journal";
import { logShellFetchTrace } from "@/lib/dibay/shell-fetch-trace";
import { recoverFrom401Once } from "@/lib/auth/api-auth-recovery";
import type { ProfileRow } from "@/lib/profile/types";

export type MeProfileGetResult = {
  status: number;
  json: unknown;
};

/** background·Region — 서버 route TTL(15s)와 맞춰 짧은 4s 재네트워크 burst 완화 */
const TTL_MS = 15_000;
/** RSC·session에서 seed 한 row — mypage 재방문·boot 직후 prewarm 완화 */
const PRIMED_PROFILE_TTL_MS = 5 * 60 * 1000;
const FLIGHT_KEY_FULL = "me:profile:get:full" as const;

let cachedFull: { expiresAt: number; value: MeProfileGetResult } | null = null;
/** boot minimal 직후 full GET 중복 스케줄만 막음 — cachedFull 에 minimal 을 넣지 않음(consent 계약). */
let cachedBootBridge: { expiresAt: number } | null = null;

/**
 * dedupe 캐시 무효화 시 한 번만 브로드캐스트 — `RegionProvider` 등이 동일 GET 으로
 * 주소·지역 상태를 따라가게 함(각 화면에서 `refreshProfileLocation` 을 또 부르지 않음).
 */
export const ME_PROFILE_CACHE_INVALIDATED_EVENT = "kasama-me-profile-cache-invalidated";

/** 프로필 저장·아바타 등 반영 직후 다음 GET이 서버 값을 보게 함 */
export function invalidateMeProfileDedupedCache(): void {
  cachedFull = null;
  cachedBootBridge = null;
  forgetSingleFlight(FLIGHT_KEY_FULL);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(ME_PROFILE_CACHE_INVALIDATED_EVENT));
    } catch {
      /* ignore */
    }
  }
}

export function peekMeProfileCached(): MeProfileGetResult | null {
  return cachedFull?.value ?? null;
}

/** RSC·session·boot merge 등 이미 확보한 full profile — mypage·prewarm 중복 GET 방지 */
export function primeMeProfileDedupedFromKnownProfile(profile: ProfileRow): void {
  const id = profile.id?.trim();
  if (!id) return;
  cachedFull = {
    value: { status: 200, json: { ok: true, profile } },
    expiresAt: Date.now() + PRIMED_PROFILE_TTL_MS,
  };
}

function peekMeProfileFullFromCachedResult(): ProfileRow | null {
  const cached = peekMeProfileCached();
  if (!cached || cached.status !== 200) return null;
  const json = cached.json as { ok?: boolean; profile?: ProfileRow | null } | null;
  if (!json?.ok || json.profile == null) return null;
  return json.profile;
}

/** TTL·primed full row 가 있으면 네트워크 full GET 불필요 */
export function isMeProfileFullFetchSkippable(): boolean {
  return isMeProfileCacheFresh() && peekMeProfileFullFromCachedResult() != null;
}

export function isMeProfileCacheFresh(): boolean {
  const now = Date.now();
  return (
    (!!cachedFull && cachedFull.expiresAt > now) ||
    (!!cachedBootBridge && cachedBootBridge.expiresAt > now)
  );
}

/** App boot minimal 응답 — full GET 합류 전 3s 브릿지(Region·consent·compliance 중복 full 방지). */
export function primeMeProfileDedupedFromBoot(result: MeProfileGetResult): void {
  if (result.status !== 200 && result.status !== 401 && result.status !== 403) return;
  cachedBootBridge = { expiresAt: Date.now() + 3_000 };
}

function profileFetchHeaders(clientCallSource: string | undefined, extra: Record<string, string> = {}): HeadersInit {
  return {
    ...(clientCallSource ? { "x-samarket-client-call-source": clientCallSource } : {}),
    ...extra,
  };
}

async function fetchMeProfileNetwork(clientCallSource?: string): Promise<Response> {
  recordBootVerifyFetch("/api/me/profile?mode=full", clientCallSource ?? "profile_full");
  logShellFetchTrace({
    api: "/api/me/profile",
    component: clientCallSource ?? "fetch-me-profile-deduped",
    reason: "fetchMeProfileFullBackground_network",
  });
  return fetch("/api/me/profile?mode=full", {
    credentials: "include",
    cache: "no-store",
    headers: profileFetchHeaders(clientCallSource, {
      "x-samarket-first-paint-blocking": "0",
      "x-samarket-surface": "background",
    }),
  });
}

async function parseMeProfileResponse(res: Response): Promise<MeProfileGetResult> {
  const json: unknown = await res.clone().json().catch(() => ({}));
  return { status: res.status, json };
}

async function fetchMeProfileWith401Recovery(clientCallSource?: string): Promise<MeProfileGetResult> {
  let res = await fetchMeProfileNetwork(clientCallSource);

  if (res.status === 401) {
    const recovery = await recoverFrom401Once("me_profile_full");
    if (recovery.recovered) {
      res = await fetchMeProfileNetwork(clientCallSource);
    } else if (!recovery.terminal) {
      return parseMeProfileResponse(res);
    }
  }

  const result = await parseMeProfileResponse(res);
  if (res.ok || res.status === 401 || res.status === 403) {
    cachedFull = { value: result, expiresAt: Date.now() + TTL_MS };
  }
  return result;
}

/** Surface/Detail — full profile (boot 이후 background·on-demand). */
export function fetchMeProfileDeduped(clientCallSource?: string): Promise<MeProfileGetResult> {
  return fetchMeProfileFullBackground(clientCallSource);
}

export function fetchMeProfileFullBackground(clientCallSource?: string): Promise<MeProfileGetResult> {
  const now = Date.now();
  if (cachedFull && cachedFull.expiresAt > now) {
    return Promise.resolve(cachedFull.value);
  }
  const primedProfile = peekMeProfileFullFromCachedResult();
  if (primedProfile) {
    const primed: MeProfileGetResult = { status: 200, json: { ok: true, profile: primedProfile } };
    cachedFull = { value: primed, expiresAt: now + TTL_MS };
    return Promise.resolve(primed);
  }
  return runSingleFlight(FLIGHT_KEY_FULL, () => fetchMeProfileWith401Recovery(clientCallSource));
}
