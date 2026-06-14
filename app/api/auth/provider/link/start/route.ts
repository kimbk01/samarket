import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createProviderLinkToken, verifyConflictStashToken } from "@/lib/auth/provider-identity/link-token.server";
import { noStoreJson } from "@/lib/auth/provider-identity/provider-credential-verify.server";
import type { ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ ok: false, errorCode: "invalid_json", message: "Invalid JSON" }, 400);
  }

  const stashToken = typeof body.stashToken === "string" ? body.stashToken.trim() : "";
  let candidate: ProviderIdentityCandidate | null = null;

  if (stashToken) {
    candidate = verifyConflictStashToken(stashToken);
    if (!candidate) {
      return noStoreJson(
        {
          ok: false,
          errorCode: "provider_link_token_invalid",
          message: "계정 연결 요청이 만료되었거나 유효하지 않습니다.",
        },
        400,
      );
    }
  } else {
    return noStoreJson(
      {
        ok: false,
        errorCode: "credential_required",
        message: "계정 연결을 시작하려면 로그인 정보 또는 stashToken이 필요합니다.",
      },
      400,
    );
  }

  const { linkToken, expiresAt } = createProviderLinkToken(auth.userId, candidate);
  return noStoreJson({ ok: true, linkToken, expiresAt, provider: candidate.provider }, 200);
}
