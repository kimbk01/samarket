import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { DibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { setClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";

export type SignupStatusApiResponse = {
  ok?: boolean;
  signup?: DibaySignupStatus;
  route?: string;
  /** Server-required consent versions (CMS published ko) the `signup` verdict was judged against. */
  requiredConsent?: { termsVersion: string; privacyVersion: string } | null;
  error?: string;
};

function signupStatusFlightKey(next?: string | null): string {
  const safe = sanitizeNextPath(next ?? null);
  return safe ? `client:me:signup-status:get:${safe}` : "client:me:signup-status:get";
}

export async function fetchSignupStatusDeduped(next?: string | null): Promise<{
  status: number;
  json: SignupStatusApiResponse | null;
}> {
  const safeNext = sanitizeNextPath(next ?? null);
  const url = safeNext
    ? `/api/me/signup-status?next=${encodeURIComponent(safeNext)}`
    : "/api/me/signup-status";
  const res = await runSingleFlight(signupStatusFlightKey(safeNext), () =>
    fetch(url, {
      credentials: "include",
      cache: "no-store",
    })
  );
  const json = (await res.clone().json().catch(() => null)) as SignupStatusApiResponse | null;
  if (res.status === 200 && json?.requiredConsent) {
    setClientRequiredConsentVersions(json.requiredConsent);
  }
  return { status: res.status, json };
}
