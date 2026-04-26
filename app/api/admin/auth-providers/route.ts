import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  buildSupabaseCallbackUrl,
  normalizeOAuthProvider,
  sortAuthProviders,
  validateRedirectUriWithWhitelist,
  type AuthProviderPublicMeta,
  type AuthProviderRow,
} from "@/lib/auth/auth-providers";
import { loadAuthProviderByProvider, loadAuthProviderRows } from "@/lib/auth/auth-provider-store";
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
    client_secret_configured: row.client_secret.trim().length > 0,
  };
}

export async function GET() {
  const admin = await requireAdminApiUser();
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
  const admin = await requireAdminApiUser();
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
  const incomingSecret = hasField("client_secret")
    ? (() => {
        const candidate = String(payload.client_secret ?? "").trim();
        if (candidate.length > 0) return candidate;
        return existing?.client_secret ?? "";
      })()
    : existing?.client_secret ?? "";
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
    client_secret: incomingSecret,
    redirect_uri: incomingRedirectUri,
    scope: incomingScope,
    sort_order: incomingSortOrder,
    updated_at: now,
  };
  const { error } = await sb.from("auth_providers").upsert(row, { onConflict: "provider" });
  if (error) {
    return jsonError(clientSafeInternalErrorMessage(error.message || "auth_provider_upsert_failed"), 500);
  }
  const { data: refreshed, error: loadError } = await sb
    .from("auth_providers")
    .select("id, provider, enabled, client_id, client_secret, redirect_uri, scope, sort_order, created_at, updated_at")
    .eq("provider", provider)
    .maybeSingle();
  if (loadError || !refreshed) {
    return jsonError(
      clientSafeInternalErrorMessage(loadError?.message || "auth_provider_refresh_failed"),
      500
    );
  }
  return jsonOk({ provider: toPublicRow(refreshed as AuthProviderRow) });
}
