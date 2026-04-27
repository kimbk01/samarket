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
  if (!sb) return DEFAULT_AUTH_PHONE_SETTINGS;
  const { data, error } = await sb
    .from("auth_phone_settings")
    .select(
      "id, enabled, country_code, provider, sms_from_name, otp_ttl_seconds, resend_cooldown_seconds, max_attempts, guide_text, created_at, updated_at"
    )
    .eq("country_code", "PH")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return DEFAULT_AUTH_PHONE_SETTINGS;
  return sanitizeAuthPhoneSettingsInput(data as Partial<AuthPhoneSettings>);
}
