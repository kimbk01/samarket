import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type AuthPhoneSettings = {
  id?: string;
  enabled: boolean;
  country_code: "PH";
  provider: "supabase" | "semaphore";
  sms_from_name: string | null;
  otp_ttl_seconds: number;
  resend_cooldown_seconds: number;
  max_attempts: number;
  guide_text: string;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_AUTH_PHONE_SETTINGS: AuthPhoneSettings = {
  enabled: false,
  country_code: "PH",
  provider: "semaphore",
  sms_from_name: null,
  otp_ttl_seconds: 300,
  resend_cooldown_seconds: 60,
  max_attempts: 5,
  guide_text: "필리핀 휴대폰 번호만 인증 가능합니다. 예: 0917 123 4567",
};

function toClampedInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function readEnvInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** SEMAPHORE_API_KEY 가 있으면 OTP 활성(관리자 DB off 여도 Vercel 배포 기본). PHONE_OTP_ENABLED=0 으로 끔. */
function applyPhoneOtpEnvEnable(settings: AuthPhoneSettings): AuthPhoneSettings {
  const flag = process.env.PHONE_OTP_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") {
    return { ...settings, enabled: false };
  }
  if (process.env.SEMAPHORE_API_KEY?.trim()) {
    return { ...settings, enabled: true, provider: "semaphore" };
  }
  if (flag === "true" || flag === "1") {
    return { ...settings, enabled: true, provider: "semaphore" };
  }
  return settings;
}

function applyPhoneOtpEnvOverrides(settings: AuthPhoneSettings): AuthPhoneSettings {
  const expireMinutes = readEnvInt("PHONE_OTP_EXPIRE_MINUTES");
  const resendSeconds = readEnvInt("PHONE_OTP_RESEND_SECONDS");
  const maxAttempts = readEnvInt("PHONE_OTP_MAX_ATTEMPTS");
  return {
    ...settings,
    otp_ttl_seconds:
      expireMinutes != null
        ? toClampedInt(expireMinutes * 60, settings.otp_ttl_seconds, 60, 1800)
        : settings.otp_ttl_seconds,
    resend_cooldown_seconds:
      resendSeconds != null
        ? toClampedInt(resendSeconds, settings.resend_cooldown_seconds, 10, 600)
        : settings.resend_cooldown_seconds,
    max_attempts:
      maxAttempts != null
        ? toClampedInt(maxAttempts, settings.max_attempts, 1, 20)
        : settings.max_attempts,
  };
}

function normalizeProvider(value: unknown): "supabase" | "semaphore" {
  const provider = String(value ?? "").trim().toLowerCase();
  if (provider === "supabase") return "supabase";
  if (provider === "semaphore" || provider === "semaphore_local") return "semaphore";
  return DEFAULT_AUTH_PHONE_SETTINGS.provider;
}

export function sanitizeAuthPhoneSettingsInput(raw: Partial<AuthPhoneSettings>): AuthPhoneSettings {
  const guide = String(raw.guide_text ?? DEFAULT_AUTH_PHONE_SETTINGS.guide_text).trim();
  const from = String(raw.sms_from_name ?? "").trim();
  return {
    ...DEFAULT_AUTH_PHONE_SETTINGS,
    enabled: raw.enabled === true,
    country_code: "PH",
    provider: normalizeProvider(raw.provider),
    sms_from_name: from || null,
    otp_ttl_seconds: toClampedInt(raw.otp_ttl_seconds, DEFAULT_AUTH_PHONE_SETTINGS.otp_ttl_seconds, 60, 1800),
    resend_cooldown_seconds: toClampedInt(
      raw.resend_cooldown_seconds,
      DEFAULT_AUTH_PHONE_SETTINGS.resend_cooldown_seconds,
      10,
      600
    ),
    max_attempts: toClampedInt(raw.max_attempts, DEFAULT_AUTH_PHONE_SETTINGS.max_attempts, 1, 20),
    guide_text: guide || DEFAULT_AUTH_PHONE_SETTINGS.guide_text,
  };
}

export async function loadAuthPhoneSettings(): Promise<AuthPhoneSettings> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return applyPhoneOtpEnvOverrides(applyPhoneOtpEnvEnable(DEFAULT_AUTH_PHONE_SETTINGS));
  const { data, error } = await sb
    .from("auth_phone_settings")
    .select(
      "id, enabled, country_code, provider, sms_from_name, otp_ttl_seconds, resend_cooldown_seconds, max_attempts, guide_text, created_at, updated_at"
    )
    .eq("country_code", "PH")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return applyPhoneOtpEnvOverrides(applyPhoneOtpEnvEnable(DEFAULT_AUTH_PHONE_SETTINGS));
  }
  return applyPhoneOtpEnvOverrides(
    applyPhoneOtpEnvEnable(sanitizeAuthPhoneSettingsInput(data as Partial<AuthPhoneSettings>)),
  );
}
