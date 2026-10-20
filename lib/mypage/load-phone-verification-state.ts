/**
 * 전화 인증 화면 진입 데이터 (최종 설계 S05) — 프로필 + 관리자 인증 설정을 병렬 조회.
 *
 * 무한 로딩 금지: 둘 중 하나라도 실패(null·HTTP 오류·fetch 거부·타임아웃 15초)면 `{ ok:false }` 를 돌려
 * 화면이 오류 + [다시 시도] 를 그리게 한다. 설정 조회는 single-flight(`me:phone-verification:get`, 파싱한 JSON 공유) 유지.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";

export type PhoneVerificationSettings = {
  enabled: boolean;
  provider: "supabase" | "semaphore";
  guide_text: string;
  resend_cooldown_seconds: number;
};

export type PhoneVerificationLoadResult =
  | { ok: true; profile: ProfileRow; settings: PhoneVerificationSettings }
  | { ok: false; reason: "profile_failed" | "settings_failed" | "timeout" };

export const PHONE_VERIFICATION_LOAD_TIMEOUT_MS = 15_000;

type SettingsJson = {
  ok?: boolean;
  verification?: {
    settings?: {
      enabled?: boolean;
      provider?: string;
      guide_text?: string;
      resend_cooldown_seconds?: number;
    };
  };
};

export function parsePhoneVerificationSettings(json: unknown): PhoneVerificationSettings | null {
  const j = json as SettingsJson | null;
  const s = j?.verification?.settings;
  if (!j?.ok || !s) return null;
  return {
    enabled: s.enabled === true,
    provider: s.provider === "semaphore" ? "semaphore" : "supabase",
    guide_text: s.guide_text ?? "",
    resend_cooldown_seconds: Number(s.resend_cooldown_seconds ?? 60),
  };
}

export const PHONE_VERIFICATION_FLIGHT_KEY = "me:phone-verification:get";

/** `GET /api/me/phone-verification` 결과 — 본문은 비행 안에서 1회만 파싱한다. */
export type PhoneVerificationGetResult = { ok: boolean; status: number; json: Record<string, unknown> | null };

/**
 * 전화 인증 상태·설정 조회 단일 경로. 같은 키 동시 호출(StrictMode 재마운트·프로필 편집+시트 등)은
 * 한 요청에 합치고 **파싱한 JSON** 을 공유한다 — Response 를 공유하면 두 번째 `res.json()` 이 실패해
 * 오류 화면·설정 누락이 난다. 네트워크 거부는 reject 그대로 전달.
 */
export function fetchPhoneVerificationJson(): Promise<PhoneVerificationGetResult> {
  return runSingleFlight(PHONE_VERIFICATION_FLIGHT_KEY, async (): Promise<PhoneVerificationGetResult> => {
    const res = await fetch("/api/me/phone-verification", { credentials: "include", cache: "no-store" });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  });
}

export async function fetchPhoneVerificationSettings(): Promise<PhoneVerificationSettings | null> {
  try {
    const r = await fetchPhoneVerificationJson();
    if (!r.ok) return null;
    return parsePhoneVerificationSettings(r.json);
  } catch {
    return null;
  }
}

export async function loadPhoneVerificationState(opts?: {
  timeoutMs?: number;
  loadProfile?: () => Promise<ProfileRow | null>;
}): Promise<PhoneVerificationLoadResult> {
  const timeoutMs = opts?.timeoutMs ?? PHONE_VERIFICATION_LOAD_TIMEOUT_MS;
  const loadProfile = opts?.loadProfile ?? getMyProfile;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<PhoneVerificationLoadResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
  });
  const work = (async (): Promise<PhoneVerificationLoadResult> => {
    const [profile, settings] = await Promise.all([
      loadProfile().catch(() => null),
      fetchPhoneVerificationSettings(),
    ]);
    if (!profile) return { ok: false, reason: "profile_failed" };
    if (!settings) return { ok: false, reason: "settings_failed" };
    return { ok: true, profile, settings };
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** `PhoneVerificationBox` snapshot — 페이지·시트 같은 규칙 */
export function buildPhoneVerifySnapshot(profile: ProfileRow, settings: PhoneVerificationSettings | null) {
  return {
    phone: profile.phone ?? null,
    phone_country_code: profile.phone_country_code ?? null,
    phone_number: profile.phone_number ?? null,
    phone_verified: profile.phone_verified === true,
    phone_verified_at: profile.phone_verified_at ?? null,
    phone_verification_method: profile.phone_verification_method ?? null,
    phone_verification_status: profile.phone_verification_status ?? null,
    member_status: profile.member_status ?? null,
    role: profile.role ?? null,
    privilegedAdmin: profile.privilegedAdmin === true,
    email: profile.auth_login_email ?? profile.email ?? null,
    provider: profile.provider ?? profile.auth_provider ?? null,
    auth_provider: profile.auth_provider ?? profile.provider ?? null,
    settings: settings ?? undefined,
  };
}
