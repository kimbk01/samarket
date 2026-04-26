import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type LoginSettingProvider =
  | "password"
  | "google"
  | "kakao"
  | "naver"
  | "apple"
  | "facebook";

export type AuthLoginSetting = {
  id: string;
  provider: LoginSettingProvider;
  label: string;
  enabled: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_AUTH_LOGIN_SETTINGS: AuthLoginSetting[] = [
  { id: "password", provider: "password", label: "아이디 로그인", enabled: true, sort_order: 1 },
  { id: "google", provider: "google", label: "Google", enabled: true, sort_order: 2 },
  { id: "kakao", provider: "kakao", label: "Kakao", enabled: true, sort_order: 3 },
  { id: "naver", provider: "naver", label: "Naver", enabled: true, sort_order: 4 },
  { id: "apple", provider: "apple", label: "Apple", enabled: true, sort_order: 5 },
  { id: "facebook", provider: "facebook", label: "Facebook", enabled: false, sort_order: 6 },
];

export class AuthLoginSettingsLoadError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthLoginSettingsLoadError";
    this.code = code;
  }
}

function isTableMissingError(message: string | undefined, code?: string | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  return code === "42P01" || (normalized.includes("auth_login_settings") && normalized.includes("does not exist"));
}

export function sortLoginSettings(settings: AuthLoginSetting[]): AuthLoginSetting[] {
  return [...settings].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function isOauthLoginProvider(provider: LoginSettingProvider): provider is Exclude<LoginSettingProvider, "password"> {
  return provider !== "password";
}

export function mapProviderToSupabaseOAuth(
  provider: Exclude<LoginSettingProvider, "password">
): "google" | "kakao" | "custom:naver" | "apple" | "facebook" {
  if (provider === "naver") return "custom:naver";
  return provider;
}

export async function loadAuthLoginSettings(): Promise<AuthLoginSetting[]> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    throw new AuthLoginSettingsLoadError("supabase_service_unconfigured", "Auth 설정 조회 구성이 준비되지 않았습니다.");
  }
  const { data, error } = await sb
    .from("auth_login_settings")
    .select("id, provider, label, enabled, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true });
  if (error) {
    const code = String((error as { code?: string } | null)?.code ?? "").trim();
    if (isTableMissingError(error.message, code)) {
      return sortLoginSettings(DEFAULT_AUTH_LOGIN_SETTINGS);
    }
    throw new AuthLoginSettingsLoadError(code || "auth_login_settings_load_failed", error.message || "Auth 설정 조회에 실패했습니다.");
  }
  const rows = Array.isArray(data) ? (data as AuthLoginSetting[]) : [];
  if (rows.length === 0) return sortLoginSettings(DEFAULT_AUTH_LOGIN_SETTINGS);
  return sortLoginSettings(
    DEFAULT_AUTH_LOGIN_SETTINGS.map((base) => {
      const matched = rows.find((row) => row.provider === base.provider);
      return matched ? { ...base, ...matched } : base;
    })
  );
}

export async function fetchAuthLoginSettingsClient(): Promise<
  | { ok: true; settings: AuthLoginSetting[] }
  | { ok: false; error: string }
> {
  const res = await fetch("/api/auth/login-settings", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; settings?: AuthLoginSetting[]; error?: string }
    | null;
  if (!res.ok || !json?.ok || !Array.isArray(json.settings)) {
    return { ok: false, error: json?.error || "로그인 방식을 불러오지 못했습니다." };
  }
  return { ok: true, settings: sortLoginSettings(json.settings) };
}
