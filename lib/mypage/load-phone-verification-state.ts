/**
 * 전화 인증 화면 진입 데이터 (최종 설계 S05) — 프로필 + 관리자 인증 설정을 병렬 조회.
 *
 * 무한 로딩 금지: 둘 중 하나라도 실패(null·HTTP 오류·fetch 거부·타임아웃 15초)면 `{ ok:false }` 를 돌려
 * 화면이 오류 + [다시 시도] 를 그리게 한다. 설정 조회는 single-flight(`me:phone-verification:get`) 유지.
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

export async function fetchPhoneVerificationSettings(): Promise<PhoneVerificationSettings | null> {
  try {
    const res = await runSingleFlight("me:phone-verification:get", () =>
      fetch("/api/me/phone-verification", { credentials: "include", cache: "no-store" }),
    );
    if (!res.ok) return null;
    const json = await res.clone().json().catch(() => null);
    return parsePhoneVerificationSettings(json);
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
