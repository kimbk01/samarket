import { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseOAuthProvider } from "@/lib/auth/oauth/config";
import { isNativeAppRequest } from "@/lib/auth/oauth/platform-request";
import {
  buildOAuthStartJsonResponse,
  buildOAuthStartLoginRedirect,
  buildOAuthStartRedirectResponse,
  createSupabaseOAuthAuthorizeUrl,
} from "@/lib/auth/oauth/server-start";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsNativeJsonResponse(req: NextRequest): boolean {
  const launch = req.nextUrl.searchParams.get("launch")?.trim().toLowerCase();
  if (launch === "native") return true;
  const accept = req.headers.get("accept")?.toLowerCase() ?? "";
  return accept.includes("application/json");
}

export async function GET(req: NextRequest) {
  const provider = normalizeSupabaseOAuthProvider(req.nextUrl.searchParams.get("provider"));
  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));

  if (!provider) {
    if (wantsNativeJsonResponse(req)) {
      return NextResponse.json(
        { ok: false, errorCode: "invalid_provider" },
        { status: 400 },
      );
    }
    return buildOAuthStartLoginRedirect(req, "invalid_provider", undefined, safeNext);
  }

  const isNative = isNativeAppRequest(req) || wantsNativeJsonResponse(req);
  const result = await createSupabaseOAuthAuthorizeUrl({
    req,
    provider,
    next: safeNext,
    isNative,
  });

  if (!result.ok) {
    if (wantsNativeJsonResponse(req)) {
      return NextResponse.json(
        { ok: false, errorCode: result.errorCode, detail: result.detail ?? null },
        { status: result.errorCode === "supabase_unconfigured" ? 503 : 400 },
      );
    }
    return buildOAuthStartLoginRedirect(req, result.errorCode, result.detail, safeNext);
  }

  if (wantsNativeJsonResponse(req)) {
    return buildOAuthStartJsonResponse(result.authorizeUrl, result.response);
  }

  return buildOAuthStartRedirectResponse(result.authorizeUrl, result.response);
}

export function OPTIONS() {
  return NextResponse.json({ ok: true });
}
