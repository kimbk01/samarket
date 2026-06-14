import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { unlinkProvider } from "@/lib/auth/provider-identity/link-provider.server";
import { isLinkableAuthProvider } from "@/lib/auth/provider-identity/provider-display";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { provider: rawProvider } = await context.params;
  const provider = String(rawProvider ?? "").trim().toLowerCase();
  if (!isLinkableAuthProvider(provider)) {
    return NextResponse.json(
      { ok: false, errorCode: "invalid_provider", message: "지원하지 않는 로그인 방식입니다." },
      { status: 400 },
    );
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, errorCode: "supabase_unconfigured" }, { status: 501 });
  }

  const result = await unlinkProvider(sb, auth.userId, provider);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errorCode: result.errorCode, message: result.message },
      { status: result.errorCode === "last_provider_unlink_blocked" ? 409 : 400 },
    );
  }

  return NextResponse.json({ ok: true, provider });
}
