import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage, jsonError, jsonOk } from "@/lib/http/api-route";
import { DEFAULT_AUTH_LOGIN_SETTINGS, loadAuthLoginSettings, type AuthLoginSetting, type LoginSettingProvider } from "@/lib/auth/login-settings";
import { DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY, loadAuthDuplicateLoginPolicy, type AuthDuplicateLoginPolicy } from "@/lib/auth/session-policy";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set<LoginSettingProvider>(["password", "google", "kakao", "naver", "apple", "facebook"]);

function isPolicyTableUnavailable(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  if (error?.code === "42P01") return true;
  if (String(error?.code ?? "").startsWith("PGRST") && message.includes("auth_duplicate_login_policy")) return true;
  return (
    message.includes("auth_duplicate_login_policy") &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find"))
  );
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const settings = await loadAuthLoginSettings();
    const sessionPolicy = await loadAuthDuplicateLoginPolicy();
    return jsonOk({ settings, sessionPolicy });
  } catch (error) {
    return jsonError(
      clientSafeInternalErrorMessage(error instanceof Error ? error.message : "Auth 설정을 불러오지 못했습니다."),
      500
    );
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return jsonError("supabase_service_unconfigured", 503);
  }
  let body: { settings?: Array<Partial<AuthLoginSetting> & { provider?: string }> };
  let sessionPolicyInput: Partial<AuthDuplicateLoginPolicy> | null = null;
  try {
    const parsed = (await req.json()) as {
      settings?: Array<Partial<AuthLoginSetting> & { provider?: string }>;
      sessionPolicy?: Partial<AuthDuplicateLoginPolicy>;
    };
    body = { settings: parsed.settings };
    sessionPolicyInput = parsed.sessionPolicy ?? null;
  } catch {
    return jsonError("invalid_json", 400);
  }
  const input = Array.isArray(body.settings) ? body.settings : null;
  if (!input || input.length === 0) {
    return jsonError("settings 배열이 필요합니다.", 400);
  }
  const now = new Date().toISOString();
  const merged = DEFAULT_AUTH_LOGIN_SETTINGS.map((base) => {
    const incoming = input.find((item) => String(item.provider ?? "").trim().toLowerCase() === base.provider);
    return {
      id: base.id,
      provider: base.provider,
      label: String(incoming?.label ?? base.label).trim() || base.label,
      enabled: incoming?.enabled === undefined ? base.enabled : incoming.enabled === true,
      sort_order: Math.max(1, Number.isFinite(Number(incoming?.sort_order)) ? Number(incoming?.sort_order) : base.sort_order),
      updated_at: now,
    };
  });
  for (const item of merged) {
    if (!PROVIDERS.has(item.provider)) {
      return jsonError("invalid_provider", 400);
    }
  }
  if (merged.every((item) => item.enabled !== true)) {
    return jsonError("최소 1개의 로그인 방식은 활성화해야 합니다.", 400);
  }
  const currentSessionPolicy = await loadAuthDuplicateLoginPolicy().catch(() => DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY);
  const sessionPolicy: AuthDuplicateLoginPolicy = {
    ...currentSessionPolicy,
    ...(sessionPolicyInput ?? {}),
    id: DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY.id,
    compare_same_login_id:
      sessionPolicyInput?.compare_same_login_id === undefined
        ? currentSessionPolicy.compare_same_login_id
        : sessionPolicyInput.compare_same_login_id === true,
    compare_same_device:
      sessionPolicyInput?.compare_same_device === undefined
        ? currentSessionPolicy.compare_same_device
        : sessionPolicyInput.compare_same_device === true,
    compare_same_browser:
      sessionPolicyInput?.compare_same_browser === undefined
        ? currentSessionPolicy.compare_same_browser
        : sessionPolicyInput.compare_same_browser === true,
    compare_same_ip:
      sessionPolicyInput?.compare_same_ip === undefined
        ? currentSessionPolicy.compare_same_ip
        : sessionPolicyInput.compare_same_ip === true,
  };
  const { error } = await sb.from("auth_login_settings").upsert(
    merged.map((item) => ({
      id: item.id,
      provider: item.provider,
      label: item.label,
      enabled: item.enabled,
      sort_order: item.sort_order,
      updated_at: now,
    })),
    { onConflict: "provider" }
  );
  if (error) {
    return jsonError(error.message || "auth_settings_update_failed", 500);
  }
  const { error: policyError } = await sb.from("auth_duplicate_login_policy").upsert(
    {
      id: sessionPolicy.id,
      compare_same_login_id: sessionPolicy.compare_same_login_id,
      compare_same_device: sessionPolicy.compare_same_device,
      compare_same_browser: sessionPolicy.compare_same_browser,
      compare_same_ip: sessionPolicy.compare_same_ip,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (policyError) {
    if (!isPolicyTableUnavailable(policyError)) {
      return jsonError(policyError.message || "duplicate_login_policy_update_failed", 500);
    }
  }
  try {
    const settings = await loadAuthLoginSettings();
    const refreshedSessionPolicy = await loadAuthDuplicateLoginPolicy();
    return jsonOk({ settings, sessionPolicy: refreshedSessionPolicy });
  } catch (loadError) {
    return jsonError(
      clientSafeInternalErrorMessage(loadError instanceof Error ? loadError.message : "Auth 설정을 불러오지 못했습니다."),
      500
    );
  }
}
