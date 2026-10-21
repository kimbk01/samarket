import { NextRequest } from "next/server";
import { getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";
import { resolvePasswordLoginIdentifier } from "@/lib/auth/resolve-password-login-identifier";
import { enforcePasswordLoginResolveQuota } from "@/lib/security/rate-limit-presets";
import { isPasswordLoginEnabledServer } from "@/lib/auth/login-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const quota = await enforcePasswordLoginResolveQuota(getRateLimitKey(req));
  if (!quota.ok) return quota.response;
  let body: { identifier?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const identifier = String(body.identifier ?? "").trim();
  if (!identifier) {
    return jsonError("identifier_required", 400);
  }
  // AD-09: 관리자 로그인 설정에서 아이디(password) 로그인을 끄면 서버도 식별자 해석을 거부한다 (UI 스위치만이 아님).
  if (!(await isPasswordLoginEnabledServer())) {
    return jsonError("아이디 로그인이 비활성화되어 있습니다.", { status: 403, code: "password_login_disabled" });
  }
  const resolved = await resolvePasswordLoginIdentifier(identifier);
  if (!resolved.ok) {
    return jsonError(resolved.error, { status: resolved.status, code: resolved.code });
  }
  return jsonOk({ identifier: resolved.identifier });
}
