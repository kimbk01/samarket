import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { findIdentitiesByUserId } from "@/lib/auth/provider-identity/repository.server";
import { LINKABLE_AUTH_PROVIDERS } from "@/lib/auth/provider-identity/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, errorCode: "supabase_unconfigured" }, { status: 501 });
  }

  const identities = await findIdentitiesByUserId(sb, auth.userId);
  const linked = new Set(identities.map((row) => row.provider));

  const providers = LINKABLE_AUTH_PROVIDERS.map((provider) => ({
    provider,
    linked: linked.has(provider),
    linkedAt: identities.find((row) => row.provider === provider)?.linked_at ?? null,
  }));

  return NextResponse.json({ ok: true, providers });
}
