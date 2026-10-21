import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSupabaseCallbackUrl,
  isAuthProviderSecretConfigured,
  normalizeOAuthProvider,
  sortAuthProviders,
  SUPPORTED_AUTH_PROVIDERS,
  type AuthProviderPublicMeta,
  type AuthProviderRow,
  type OAuthProvider,
} from "@/lib/auth/auth-providers";

type AnyRow = Record<string, unknown>;

export function isAuthProvidersTableMissing(message: string | undefined, code?: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  if (code === "42P01") return true;
  return normalized.includes("auth_providers") && (normalized.includes("does not exist") || normalized.includes("schema cache"));
}

function normalizeRow(row: AnyRow): AuthProviderRow | null {
  const provider = normalizeOAuthProvider(row.provider);
  if (!provider) return null;
  return {
    id: String(row.id ?? provider),
    provider,
    enabled: row.enabled === true,
    client_id: String(row.client_id ?? ""),
    client_secret: String(row.client_secret ?? ""),
    client_secret_configured: row.client_secret_configured === true,
    redirect_uri: String(row.redirect_uri ?? ""),
    scope: String(row.scope ?? ""),
    sort_order: Math.max(1, Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 1),
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export function toAuthProviderPublic(row: AuthProviderRow): AuthProviderPublicMeta {
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    client_id: row.client_id,
    redirect_uri: row.redirect_uri,
    scope: row.scope,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client_secret_configured: isAuthProviderSecretConfigured(row),
  };
}

function defaultRows(): AuthProviderRow[] {
  const defaultSupabaseCallback = buildSupabaseCallbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";
  return SUPPORTED_AUTH_PROVIDERS.map((provider, index) => ({
    id: provider,
    provider,
    enabled: false,
    client_id: "",
    client_secret: "",
    redirect_uri: defaultSupabaseCallback,
    scope: "",
    sort_order: index + 1,
  }));
}

export async function loadAuthProviderRows(sb: SupabaseClient): Promise<AuthProviderRow[]> {
  const { data, error } = await sb
    .from("auth_providers")
    .select("id, provider, enabled, client_id, client_secret, client_secret_configured, redirect_uri, scope, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true });
  if (error) {
    const errorCode = String((error as { code?: string } | null)?.code ?? "");
    if (isAuthProvidersTableMissing(error.message, errorCode)) {
      return defaultRows();
    }
    throw new Error(error.message || "auth_providers_load_failed");
  }
  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeRow(row as AnyRow))
    .filter((row): row is AuthProviderRow => Boolean(row));
  if (rows.length === 0) return defaultRows();
  return sortAuthProviders(rows);
}

export async function loadAuthProviderByProvider(
  sb: SupabaseClient,
  provider: OAuthProvider
): Promise<AuthProviderRow | null> {
  const { data, error } = await sb
    .from("auth_providers")
    .select("id, provider, enabled, client_id, client_secret, client_secret_configured, redirect_uri, scope, sort_order, created_at, updated_at")
    .eq("provider", provider)
    .maybeSingle();
  if (error) {
    const errorCode = String((error as { code?: string } | null)?.code ?? "");
    if (isAuthProvidersTableMissing(error.message, errorCode)) {
      return null;
    }
    throw new Error(error.message || "auth_provider_load_failed");
  }
  if (!data) return null;
  return normalizeRow(data as AnyRow);
}

/** 관리자 설정과 무관하게 서버에서 항상 차단하는 공급자 (Naver = Owner 결정 P0-1, Facebook = 미구현). */
const ALWAYS_DISABLED_LOGIN_PROVIDERS = new Set<string>(["naver", "facebook"]);
/** DB 조회 실패 시 로그인 장애를 막기 위해 허용(fail-open)하는 공급자. */
const FAIL_OPEN_LOGIN_PROVIDERS = new Set<string>(["google", "kakao", "apple"]);

export type AuthProviderLoginGate =
  | { allowed: true; source: "db_enabled" | "fail_open_no_row" | "fail_open_load_error" | "fail_open_no_client" }
  | { allowed: false; reason: "provider_always_disabled" | "provider_disabled_in_db" | "provider_unknown" };

/**
 * OA-14 — 로그인 시작/교환 서버 가드 (`auth_providers.enabled` 단일 확인).
 * - naver/facebook: 항상 거부
 * - google/kakao/apple: row 가 enabled=false 면 거부. row 없음·테이블 없음·조회 오류·client 없음 → 허용 + 로그
 */
export async function resolveAuthProviderLoginGate(
  sb: SupabaseClient | null,
  rawProvider: string,
): Promise<AuthProviderLoginGate> {
  const provider = String(rawProvider ?? "").trim().toLowerCase();
  if (ALWAYS_DISABLED_LOGIN_PROVIDERS.has(provider)) {
    return { allowed: false, reason: "provider_always_disabled" };
  }
  if (!FAIL_OPEN_LOGIN_PROVIDERS.has(provider)) {
    return { allowed: false, reason: "provider_unknown" };
  }
  if (!sb) {
    console.warn("[auth/provider-gate]", JSON.stringify({ event: "provider_gate_fail_open", provider, cause: "no_client" }));
    return { allowed: true, source: "fail_open_no_client" };
  }
  try {
    const row = await loadAuthProviderByProvider(sb, provider as OAuthProvider);
    if (!row) return { allowed: true, source: "fail_open_no_row" };
    if (row.enabled) return { allowed: true, source: "db_enabled" };
    return { allowed: false, reason: "provider_disabled_in_db" };
  } catch (error) {
    console.warn(
      "[auth/provider-gate]",
      JSON.stringify({
        event: "provider_gate_fail_open",
        provider,
        cause: "load_error",
        error: (error instanceof Error ? error.message : "unknown").slice(0, 120),
      }),
    );
    return { allowed: true, source: "fail_open_load_error" };
  }
}
