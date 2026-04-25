import { NextRequest, NextResponse } from "next/server";
import { normalizeOAuthProvider, validateRedirectUriWithWhitelist } from "@/lib/auth/auth-providers";
import { loadAuthProviderByProvider } from "@/lib/auth/auth-provider-store";
import {
  buildAuthorizeUrl,
  createOauthState,
  getOauthStateCookieMeta,
} from "@/lib/auth/oauth-runtime";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const provider = normalizeOAuthProvider(req.nextUrl.searchParams.get("provider"));
  if (!provider) return jsonError("invalid_provider", 400);
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("supabase_service_unconfigured", 503);
  const config = await loadAuthProviderByProvider(sb, provider).catch(() => null);
  if (!config || config.enabled !== true) {
    return jsonError("provider_not_enabled", 400);
  }
  if (!config.client_id.trim() || !config.client_secret.trim() || !config.redirect_uri.trim()) {
    return jsonError("provider_key_missing", 400);
  }
  if (!validateRedirectUriWithWhitelist(config.redirect_uri, req.nextUrl.origin)) {
    return jsonError("redirect_uri_not_allowed", 400);
  }
  const { state, cookieValue } = createOauthState(provider);
  const authorizeUrl = buildAuthorizeUrl(config, state);
  const res = jsonOk({ authorize_url: authorizeUrl });
  res.cookies.set(getOauthStateCookieMeta().name, cookieValue, getOauthStateCookieMeta());
  return res;
}

export function OPTIONS() {
  return NextResponse.json({ ok: true });
}
