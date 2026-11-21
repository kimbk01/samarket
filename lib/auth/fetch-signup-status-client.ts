import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { DibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { setRegistrationPendingFromServer } from "@/lib/auth/registration-pending-state.client";
import {
  setClientRequiredConsentVersions,
  type ClientRequiredConsentVersions,
} from "@/lib/legal/client-required-consent";

export type SignupStatusApiResponse = {
  ok?: boolean;
  signup?: DibaySignupStatus;
  route?: string;
  /** 가입 완료 = 동의 + 전화 인증 + 대표 주소 */
  registration?: { complete: boolean; nextStep: "terms" | "phone" | "address" | null };
  /** Server-required consent versions (CMS published ko) the `signup` verdict was judged against. */
  requiredConsent?: ClientRequiredConsentVersions | null;
  error?: string;
};

function signupStatusFlightKey(next?: string | null, inSession?: boolean): string {
  const safe = sanitizeNextPath(next ?? null);
  const base = safe ? `client:me:signup-status:get:${safe}` : "client:me:signup-status:get";
  return inSession ? `${base}:session` : base;
}

/**
 * `opts.inSession` — 화면 안 이동(가입 단계 완료 뒤 등)이면 `route` 가 원래 화면(채팅방 등)을 지우지 않는다(재감사 M1).
 * 로그인 직후(아이디 로그인·첫 가입 동의)는 기본값(false) — 계정 묶인 바로가기 복원 금지.
 */
export async function fetchSignupStatusDeduped(
  next?: string | null,
  opts?: { inSession?: boolean },
): Promise<{
  status: number;
  json: SignupStatusApiResponse | null;
}> {
  const safeNext = sanitizeNextPath(next ?? null);
  const inSession = opts?.inSession === true;
  const params = new URLSearchParams();
  if (safeNext) params.set("next", safeNext);
  if (inSession) params.set("scope", "session");
  const qs = params.toString();
  const url = qs ? `/api/me/signup-status?${qs}` : "/api/me/signup-status";
  const res = await runSingleFlight(signupStatusFlightKey(safeNext, inSession), () =>
    fetch(url, {
      credentials: "include",
      cache: "no-store",
    })
  );
  const json = (await res.clone().json().catch(() => null)) as SignupStatusApiResponse | null;
  if (res.status === 200 && json?.requiredConsent) {
    setClientRequiredConsentVersions(json.requiredConsent);
  }
  if (res.status === 200 && json?.registration && typeof window !== "undefined") {
    setRegistrationPendingFromServer(json.registration.nextStep);
  }
  return { status: res.status, json };
}
