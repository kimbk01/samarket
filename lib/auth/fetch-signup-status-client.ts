import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { DibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export type SignupStatusApiResponse = {
  ok?: boolean;
  signup?: DibaySignupStatus;
  route?: string;
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
  const json = (await res.json().catch(() => null)) as SignupStatusApiResponse | null;
  return { status: res.status, json };
}
