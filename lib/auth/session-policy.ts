import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type AuthDuplicateLoginPolicy = {
  id: string;
  compare_same_login_id: boolean;
  compare_same_device: boolean;
  compare_same_browser: boolean;
  compare_same_ip: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SessionConflictMeta = {
  login_identifier?: string | null;
  device_key?: string | null;
  browser_key?: string | null;
  ip_address?: string | null;
};

export const DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY: AuthDuplicateLoginPolicy = {
  id: "default",
  compare_same_login_id: true,
  compare_same_device: true,
  compare_same_browser: true,
  compare_same_ip: false,
};

function isMissingTableError(message: string | undefined, code?: string | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  if (code === "42P01") return true;
  if (String(code ?? "").startsWith("PGRST") && normalized.includes("auth_duplicate_login_policy")) return true;
  return (
    normalized.includes("auth_duplicate_login_policy") &&
    (normalized.includes("does not exist") ||
      normalized.includes("schema cache") ||
      normalized.includes("could not find"))
  );
}

export async function loadAuthDuplicateLoginPolicy(): Promise<AuthDuplicateLoginPolicy> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY;
  const { data, error } = await sb
    .from("auth_duplicate_login_policy")
    .select("id, compare_same_login_id, compare_same_device, compare_same_browser, compare_same_ip, created_at, updated_at")
    .eq("id", DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY.id)
    .maybeSingle();
  if (error) {
    const code = String((error as { code?: string } | null)?.code ?? "").trim();
    if (isMissingTableError(error.message, code)) return DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY;
    throw new Error(error.message || "auth_duplicate_login_policy_load_failed");
  }
  if (!data) return DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY;
  return {
    ...DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY,
    ...(data as Partial<AuthDuplicateLoginPolicy>),
  };
}

function normalized(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isDuplicateLoginConflict(
  policy: AuthDuplicateLoginPolicy,
  current: SessionConflictMeta,
  existing: SessionConflictMeta
): boolean {
  if (!policy.compare_same_login_id) return false;
  const currentLoginId = normalized(current.login_identifier);
  const existingLoginId = normalized(existing.login_identifier);
  if (currentLoginId && existingLoginId && currentLoginId !== existingLoginId) return false;
  if (policy.compare_same_device) {
    const currentDevice = normalized(current.device_key);
    const existingDevice = normalized(existing.device_key);
    if (!currentDevice || !existingDevice || currentDevice !== existingDevice) return false;
  }
  if (policy.compare_same_browser) {
    const currentBrowser = normalized(current.browser_key);
    const existingBrowser = normalized(existing.browser_key);
    if (!currentBrowser || !existingBrowser || currentBrowser !== existingBrowser) return false;
  }
  if (policy.compare_same_ip) {
    const currentIp = normalized(current.ip_address);
    const existingIp = normalized(existing.ip_address);
    if (!currentIp || !existingIp || currentIp !== existingIp) return false;
  }
  return true;
}
