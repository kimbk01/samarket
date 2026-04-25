import { NextRequest } from "next/server";
import { getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";
import { resolvePasswordLoginIdentifier } from "@/lib/auth/resolve-password-login-identifier";
import { enforcePasswordLoginResolveQuota } from "@/lib/security/rate-limit-presets";

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
  const resolved = await resolvePasswordLoginIdentifier(identifier);
  if (!resolved.ok) {
    return jsonError(resolved.error, resolved.status);
  }
  return jsonOk({ identifier: resolved.identifier });
}
