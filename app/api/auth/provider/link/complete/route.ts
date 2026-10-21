import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { completeProviderLink } from "@/lib/auth/provider-identity/link-provider.server";
import {
  createProviderLinkToken,
  verifyConflictStashToken,
  verifyProviderLinkToken,
} from "@/lib/auth/provider-identity/link-token.server";
import {
  noStoreJson,
  parseProviderBody,
  verifyProviderCredentialInput,
} from "@/lib/auth/provider-identity/provider-credential-verify.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return noStoreJson({ ok: false, errorCode: "supabase_unconfigured" }, 501);
  }

  const linkTokenInput = typeof body.linkToken === "string" ? body.linkToken.trim() : "";
  const stashToken = typeof body.stashToken === "string" ? body.stashToken.trim() : "";
  const credentialInput = parseProviderBody(body);
  const credentialSupplied = Boolean(
    credentialInput.idToken?.trim()
      || credentialInput.accessToken?.trim()
      || credentialInput.identityToken?.trim(),
  );

  let linkToken = linkTokenInput;
  try {
    if (credentialSupplied) {
      // P1-4 — 새 credential 이 제출되면 그 검증 결과만 사용. 실패 시 stash 로 fallback 하지 않는다.
      const verified = await verifyProviderCredentialInput(credentialInput).catch(() => null);
      if (!verified || "errorCode" in verified) {
        return noStoreJson(
          {
            ok: false,
            errorCode: verified && "errorCode" in verified ? verified.errorCode : "credential_verify_failed",
            message:
              verified && "errorCode" in verified
                ? verified.message
                : "로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.",
          },
          400,
        );
      }
      linkToken = createProviderLinkToken(auth.userId, verified).linkToken;
    } else if (!linkToken && stashToken) {
      // P1-4 — stash 는 conflict 대상 회원(= 현재 세션) 바인딩 검증 후에만 사용.
      const candidate = verifyConflictStashToken(stashToken, auth.userId);
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
      linkToken = createProviderLinkToken(auth.userId, candidate).linkToken;
    }
  } catch {
    return noStoreJson({ ok: false, errorCode: "provider_link_unavailable" }, 503);
  }

  if (!linkToken) {
    return noStoreJson(
      {
        ok: false,
        errorCode: "credential_missing",
        message: "로그인 정보가 없습니다. 다시 시도해 주세요.",
      },
      400,
    );
  }

  const pending = verifyProviderLinkToken(linkToken, auth.userId);
  if (!pending) {
    return noStoreJson(
      {
        ok: false,
        errorCode: "provider_link_token_invalid",
        message: "계정 연결 요청이 만료되었거나 유효하지 않습니다.",
      },
      400,
    );
  }

  const result = await completeProviderLink(sb, auth.userId, linkToken);
  if (!result.ok) {
    return noStoreJson(
      { ok: false, errorCode: result.errorCode, message: result.message },
      result.errorCode === "last_provider_unlink_blocked" ? 409 : 409,
    );
  }

  return noStoreJson({ ok: true, provider: result.provider }, 200);
}
