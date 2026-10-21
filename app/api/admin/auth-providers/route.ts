import { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  buildSupabaseCallbackUrl,
  isAuthProviderSecretConfigured,
  normalizeOAuthProvider,
  sortAuthProviders,
  validateRedirectUriWithWhitelist,
  type AuthProviderPublicMeta,
  type AuthProviderRow,
} from "@/lib/auth/auth-providers";
import { loadAuthProviderByProvider, loadAuthProviderRows } from "@/lib/auth/auth-provider-store";
import { maskAuthProviderForAudit } from "@/lib/auth/auth-provider-audit";
import { clientSafeInternalErrorMessage, jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderPayload = {
  provider?: string;
  enabled?: boolean;
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
  scope?: string;
  sort_order?: number;
};

function toPublicRow(row: AuthProviderRow): AuthProviderPublicMeta {
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

/** P2-16: 비밀값 원문은 Vault 에만 저장 (service_role 전용 RPC). 테이블에는 설정 여부 플래그만 남긴다. */
const AUTH_PROVIDER_SECRET_RPC = "admin_set_auth_provider_secret";

/** V3-09: OAuth 로그인 수단 — 전체 회원 로그인에 영향 → settings 권한 (auth-phone 과 동일 키). */
export async function GET() {
  const admin = await requireAdminPermission("settings");
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("supabase_service_unconfigured", 503);
  try {
    const rows = await loadAuthProviderRows(sb);
    return jsonOk({ providers: sortAuthProviders(rows).map(toPublicRow) });
  } catch (error) {
    return jsonError(
      clientSafeInternalErrorMessage(error instanceof Error ? error.message : "auth_providers_load_failed"),
      500
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminPermission("settings");
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("supabase_service_unconfigured", 503);
  let payload: ProviderPayload;
  try {
    payload = (await req.json()) as ProviderPayload;
  } catch {
    return jsonError("invalid_json", 400);
  }
  const provider = normalizeOAuthProvider(payload.provider);
  if (!provider) return jsonError("invalid_provider", 400);
  const now = new Date().toISOString();
  const existing = await loadAuthProviderByProvider(sb, provider).catch(() => null);
  const hasField = (key: keyof ProviderPayload): boolean =>
    Object.prototype.hasOwnProperty.call(payload, key);
  const incomingEnabled = hasField("enabled")
    ? payload.enabled === true
    : existing?.enabled ?? false;
  const incomingClientId = hasField("client_id")
    ? String(payload.client_id ?? "").trim()
    : existing?.client_id ?? "";
  // 빈 값·생략 = 기존 비밀값 유지. 새 값만 Vault 로 저장한다 (원문을 테이블에 쓰지 않음).
  const newSecret = hasField("client_secret") ? String(payload.client_secret ?? "").trim() : "";
  const secretChanged = newSecret.length > 0;
  const secretConfigured = secretChanged || (existing ? isAuthProviderSecretConfigured(existing) : false);
  const defaultSupabaseCallback = buildSupabaseCallbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";
  const incomingRedirectUri = hasField("redirect_uri")
    ? String(payload.redirect_uri ?? "").trim()
    : existing?.redirect_uri ?? defaultSupabaseCallback;
  const incomingScope = hasField("scope")
    ? String(payload.scope ?? "").trim()
    : existing?.scope ?? "";
  const incomingSortOrder = hasField("sort_order")
    ? Math.max(1, Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 1)
    : Math.max(1, existing?.sort_order ?? 1);
  if (incomingRedirectUri && !validateRedirectUriWithWhitelist(incomingRedirectUri, req.nextUrl.origin)) {
    return jsonError("redirect_uri_not_allowed", 400);
  }
  const row = {
    provider,
    enabled: incomingEnabled,
    client_id: incomingClientId,
    redirect_uri: incomingRedirectUri,
    scope: incomingScope,
    sort_order: incomingSortOrder,
    updated_at: now,
    // 비밀값 칸은 RPC 가 Vault 참조값(vault:<name>)으로 바꾼다 — 여기서는 플래그만 맞춘다 (생략 시 기존 값 유지).
    ...(secretChanged ? { client_secret_configured: true } : {}),
  };
  if (secretChanged) {
    const { error: secretError } = await sb.rpc(AUTH_PROVIDER_SECRET_RPC, {
      p_provider: provider,
      p_secret: newSecret,
    });
    if (secretError) {
      return jsonError(clientSafeInternalErrorMessage("auth_provider_secret_store_failed"), 500);
    }
  }
  const { error } = await sb.from("auth_providers").upsert(row, { onConflict: "provider" });
  if (error) {
    return jsonError(clientSafeInternalErrorMessage(error.message || "auth_provider_upsert_failed"), 500);
  }
  const { data: refreshed, error: loadError } = await sb
    .from("auth_providers")
    .select("id, provider, enabled, client_id, client_secret_configured, redirect_uri, scope, sort_order, created_at, updated_at")
    .eq("provider", provider)
    .maybeSingle();
  if (loadError || !refreshed) {
    return jsonError(
      clientSafeInternalErrorMessage(loadError?.message || "auth_provider_refresh_failed"),
      500
    );
  }
  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "auth_provider",
    targetId: provider,
    action: existing ? "auth_provider.update" : "auth_provider.create",
    before: existing
      ? {
          ...maskAuthProviderForAudit(existing),
          client_secret: isAuthProviderSecretConfigured(existing) ? "***" : "",
        }
      : null,
    after: {
      ...maskAuthProviderForAudit({ ...row, client_secret: "" }),
      client_secret: secretConfigured ? "***" : "",
      client_secret_changed: secretChanged,
    },
  });
  return jsonOk({
    provider: toPublicRow({ ...(refreshed as Omit<AuthProviderRow, "client_secret">), client_secret: "" }),
  });
}
