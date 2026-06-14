import { NextRequest } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  buildProviderEmailConflictPayload,
  resolveProviderLogin,
} from "@/lib/auth/provider-identity/resolve-provider-login.server";
import {
  isApplePrivateRelayEmail,
  normalizeProviderEmail,
} from "@/lib/auth/provider-identity/email-policy";
import { noStoreJson } from "@/lib/auth/provider-identity/provider-credential-verify.server";
import { isLinkableAuthProvider } from "@/lib/auth/provider-identity/provider-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ ok: false, errorCode: "invalid_json", message: "Invalid JSON" }, 400);
  }

  const provider = String(body.provider ?? "").trim().toLowerCase();
  const providerUserId = String(body.providerUserId ?? body.provider_user_id ?? "").trim();
  if (!isLinkableAuthProvider(provider) || !providerUserId) {
    return noStoreJson(
      { ok: false, errorCode: "invalid_request", message: "provider와 providerUserId가 필요합니다." },
      400,
    );
  }

  const email = normalizeProviderEmail(typeof body.email === "string" ? body.email : null);
  const emailVerified = body.emailVerified === true || body.email_verified === true;
  const emailIsPrivateRelay =
    body.emailIsPrivateRelay === true
    || body.email_is_private_relay === true
    || isApplePrivateRelayEmail(email);

  const candidate = {
    provider,
    providerUserId,
    email,
    emailVerified,
    emailIsPrivateRelay,
    rawProfile:
      body.rawProfile && typeof body.rawProfile === "object"
        ? (body.rawProfile as Record<string, unknown>)
        : {},
  };

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return noStoreJson({ ok: false, errorCode: "supabase_unconfigured" }, 501);
  }

  const resolved = await resolveProviderLogin(sb, candidate);

  if (resolved.status === "existing") {
    return noStoreJson({ ok: true, status: "existing", userId: resolved.userId }, 200);
  }
  if (resolved.status === "email_conflict") {
    return noStoreJson(
      { ok: true, status: "email_conflict", ...buildProviderEmailConflictPayload(resolved) },
      200,
    );
  }
  if (resolved.status === "provider_user_id_conflict") {
    return noStoreJson(
      { ok: true, status: "provider_user_id_conflict", message: resolved.message },
      200,
    );
  }

  return noStoreJson({ ok: true, status: "new" }, 200);
}
