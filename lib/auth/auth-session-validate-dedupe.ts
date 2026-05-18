import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import {
  peekAuthSessionValidatedOk,
  setAuthSessionValidatedOk,
} from "@/lib/auth/auth-session-response-cache";
import {
  peekAuthSessionValidateCached,
  setAuthSessionValidateCached,
} from "@/lib/auth/auth-session-validate-cache";
import { validateActiveSessionLight } from "@/lib/auth/server-guards";
import type { NextResponse } from "next/server";

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

/**
 * 동일 userId·세션 지문으로 `validateActiveSessionLight` 가 동시에 여러 번 호출될 때 DB 1회로 합류.
 */
export async function validateActiveSessionLightDeduped(
  userId: string,
  sessionFingerprint: string
): Promise<ValidateDedupeOk | ValidateDedupeFail> {
  if (peekAuthSessionValidatedOk(userId, sessionFingerprint) || peekAuthSessionValidateCached(userId, sessionFingerprint)) {
    return { ok: true, inFlightHit: false, ttlCacheHit: true };
  }

  const flightKey = authSessionValidateDedupeKey(userId, sessionFingerprint);
  const inFlightHit = getSingleFlightPromise(flightKey) !== undefined;

  const result = await runSingleFlight(flightKey, async () => {
    if (peekAuthSessionValidatedOk(userId, sessionFingerprint) || peekAuthSessionValidateCached(userId, sessionFingerprint)) {
      return { ok: true as const };
    }
    const validated = await validateActiveSessionLight(userId);
    if (!validated.ok) {
      return { ok: false as const, response: validated.response };
    }
    setAuthSessionValidatedOk(userId, sessionFingerprint);
    setAuthSessionValidateCached(userId, sessionFingerprint);
    return { ok: true as const };
  });

  if (result.ok) {
    return { ok: true, inFlightHit, ttlCacheHit: false };
  }
  return { ok: false, response: result.response, inFlightHit, ttlCacheHit: false };
}
