import { NextRequest } from "next/server";
import {
  sortAuthProviders,
  type AuthProviderPublic,
} from "@/lib/auth/auth-providers";
import { loadAuthProviderRows } from "@/lib/auth/auth-provider-store";
import { clientSafeInternalErrorMessage, jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPublicRows(rows: Array<AuthProviderPublic & { client_secret?: string }>): AuthProviderPublic[] {
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    client_id: row.client_id,
    redirect_uri: row.redirect_uri,
    scope: row.scope,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function GET(req: NextRequest) {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("supabase_service_unconfigured", 503);
  const enabledOnly = req.nextUrl.searchParams.get("enabled") === "true";
  try {
    const rows = await loadAuthProviderRows(sb);
    const filtered = enabledOnly
      ? rows.filter(
          (row) =>
            row.enabled &&
            row.client_id.trim().length > 0 &&
            row.client_secret.trim().length > 0 &&
            row.redirect_uri.trim().length > 0
        )
      : rows;
    return jsonOk({ providers: sortAuthProviders(toPublicRows(filtered)) });
  } catch (error) {
    return jsonError(
      clientSafeInternalErrorMessage(error instanceof Error ? error.message : "auth_providers_load_failed"),
      500
    );
  }
}
