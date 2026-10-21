import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  isRecentSignInForSensitiveAction,
  unlinkProvider,
} from "@/lib/auth/provider-identity/link-provider.server";
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

  // OA-16 — 최근 10분 내 로그인한 세션만 연결 해제 허용 (탈취 세션의 즉시 해제 차단).
  const { data: authUserData, error: authUserError } = await sb.auth.admin.getUserById(auth.userId);
  if (authUserError || !authUserData?.user) {
    return NextResponse.json({ ok: false, errorCode: "auth_user_load_failed" }, { status: 503 });
  }
  if (!isRecentSignInForSensitiveAction(authUserData.user.last_sign_in_at)) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "reauth_required",
        message: "보안을 위해 다시 로그인한 뒤 연결을 해제해 주세요.",
      },
      { status: 403 },
    );
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
