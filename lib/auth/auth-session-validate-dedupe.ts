import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { logAuthDedupeWarmBreakdown } from "@/lib/auth/auth-hot-path-breakdown";
import {
  peekAuthSessionValidatedOk,
  setAuthSessionValidatedOk,
} from "@/lib/auth/auth-session-response-cache";
import {
  peekAuthSessionValidateCached,
  setAuthSessionValidateCached,
} from "@/lib/auth/auth-session-validate-cache";
import { peekAuthLightSessionSnapshot } from "@/lib/auth/auth-light-session-snapshot-cache";
import { validateActiveSessionLight } from "@/lib/auth/server-guards";
import { NextResponse } from "next/server";
import type { AuthHotPathSource } from "@/lib/auth/auth-hot-path-breakdown";

export function authSessionValidateDedupeKey(userId: string, sessionFingerprint: string): string {
  return `auth-session-validate:${userId.trim()}\0${sessionFingerprint}`;
}

type ValidateDedupeOk = { ok: true; inFlightHit: boolean; ttlCacheHit: boolean };
type ValidateDedupeFail = {
  ok: false;
  response: NextResponse;
  inFlightHit: boolean;
  ttlCacheHit: boolean;
};

function warmAuthSource(userId: string, sessionFingerprint: string): AuthHotPathSource {
  if (peekAuthLightSessionSnapshot(userId, sessionFingerprint).hit) return "light_snapshot";
  return "ttl_cache";
}

function logDedupeWarmHit(
  userId: string,
  sessionFingerprint: string,
  source: AuthHotPathSource,
  singleflightHit?: boolean
): void {
  logAuthDedupeWarmBreakdown({
    userId,
    sessionFingerprint,
    source,
    singleflightHit,
    route: "auth-session-validate-dedupe",
  });
}

/**
 * 동일 userId·세션 지문으로 `validateActiveSessionLight` 가 동시에 여러 번 호출될 때 DB 1회로 합류.
 */
export async function validateActiveSessionLightDeduped(
  userId: string,
  sessionFingerprint: string
): Promise<ValidateDedupeOk | ValidateDedupeFail> {
  if (peekAuthSessionValidatedOk(userId, sessionFingerprint) || peekAuthSessionValidateCached(userId, sessionFingerprint)) {
    logDedupeWarmHit(userId, sessionFingerprint, warmAuthSource(userId, sessionFingerprint));
    return { ok: true, inFlightHit: false, ttlCacheHit: true };
  }

  const flightKey = authSessionValidateDedupeKey(userId, sessionFingerprint);
  const inFlightHit = getSingleFlightPromise(flightKey) !== undefined;

  const result = await runSingleFlight(flightKey, async () => {
    if (peekAuthSessionValidatedOk(userId, sessionFingerprint) || peekAuthSessionValidateCached(userId, sessionFingerprint)) {
      logDedupeWarmHit(userId, sessionFingerprint, warmAuthSource(userId, sessionFingerprint));
      return { ok: true as const };
    }
    const validated = await validateActiveSessionLight(userId, sessionFingerprint, {
      logBreakdown: process.env.NODE_ENV === "development",
      route: "auth-session-validate-dedupe",
    });
    if (!validated.ok) {
      // 합류한 호출자들이 Response 1개를 같이 쓰면 먼저 보낸 요청이 body 를 잠가 다음 요청이
      // 「failed to pipe response」 500 이 된다 (2026-10-31 운영). 실패 내용만 공유하고 응답은 호출자마다 새로 만든다.
      return {
        ok: false as const,
        failure: {
          status: validated.response.status,
          body: (await validated.response.json().catch(() => null)) as unknown,
          headers: [...validated.response.headers.entries()].filter(
            ([k]) => k.toLowerCase() !== "content-length"
          ),
        },
      };
    }
    setAuthSessionValidatedOk(userId, sessionFingerprint);
    setAuthSessionValidateCached(userId, sessionFingerprint);
    return { ok: true as const };
  });

  if (result.ok) {
    if (inFlightHit) {
      logDedupeWarmHit(userId, sessionFingerprint, "singleflight", true);
    }
    return { ok: true, inFlightHit, ttlCacheHit: false };
  }
  const { status, body, headers } = result.failure;
  return {
    ok: false,
    response: NextResponse.json(body, { status, headers: new Headers(headers) }),
    inFlightHit,
    ttlCacheHit: false,
  };
}

