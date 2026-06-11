import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { DibaySignupStatus } from "@/lib/auth/dibay-signup-status";

export type SignupStatusApiResponse = {
  ok?: boolean;
  signup?: DibaySignupStatus;
  route?: string;
  error?: string;
};

const FLIGHT_KEY = "client:me:signup-status:get";

export async function fetchSignupStatusDeduped(): Promise<{
  status: number;
  json: SignupStatusApiResponse | null;
}> {
  const res = await runSingleFlight(FLIGHT_KEY, () =>
    fetch("/api/me/signup-status", {
      credentials: "include",
      cache: "no-store",
    })
  );
  const json = (await res.json().catch(() => null)) as SignupStatusApiResponse | null;
  return { status: res.status, json };
}
