import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAppleIdentityToken } from "@/lib/auth/native/apple-token-verify.server";
import { verifyGoogleIdToken } from "@/lib/auth/native/google-token-verify.server";
import { verifyKakaoNativeCredential } from "@/lib/auth/native/kakao-token-verify.server";
import {
  buildAppleProviderCandidate,
  buildGoogleProviderCandidate,
  buildKakaoProviderCandidate,
} from "@/lib/auth/provider-identity/native-session-bridge.server";
import type { LinkableAuthProvider, ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";
import { isLinkableAuthProvider } from "@/lib/auth/provider-identity/provider-display";

export type ProviderCredentialInput = {
  provider: string;
  idToken?: string | null;
  accessToken?: string | null;
  identityToken?: string | null;
  userIdentifier?: string | null;
  nonce?: string | null;
};

export async function verifyProviderCredentialInput(
  input: ProviderCredentialInput,
): Promise<ProviderIdentityCandidate | { errorCode: string; message: string }> {
  const provider = String(input.provider ?? "").trim().toLowerCase();
  if (!isLinkableAuthProvider(provider)) {
    return { errorCode: "invalid_provider", message: "지원하지 않는 로그인 방식입니다." };
  }

  if (provider === "google") {
    const idToken = String(input.idToken ?? "").trim();
    if (!idToken) {
      return { errorCode: "credential_missing", message: "Google 로그인 정보가 없습니다." };
    }
    const verified = await verifyGoogleIdToken({ idToken });
    return buildGoogleProviderCandidate(verified);
  }

  if (provider === "kakao") {
    const verified = await verifyKakaoNativeCredential({
      accessToken: input.accessToken,
      idToken: input.idToken,
    });
    return buildKakaoProviderCandidate(verified);
  }

  const identityToken = String(input.identityToken ?? input.idToken ?? "").trim();
  if (!identityToken) {
    return { errorCode: "credential_missing", message: "Apple 로그인 정보가 없습니다." };
  }
  const verified = await verifyAppleIdentityToken({
    identityToken,
    expectedNonce: input.nonce ?? undefined,
  });
  return buildAppleProviderCandidate(verified, input.userIdentifier);
}

export function parseProviderBody(body: Record<string, unknown>): ProviderCredentialInput {
  return {
    provider: String(body.provider ?? ""),
    idToken: typeof body.idToken === "string" ? body.idToken : null,
    accessToken: typeof body.accessToken === "string" ? body.accessToken : null,
    identityToken: typeof body.identityToken === "string" ? body.identityToken : null,
    userIdentifier: typeof body.userIdentifier === "string" ? body.userIdentifier : null,
    nonce: typeof body.nonce === "string" ? body.nonce : null,
  };
}

export function noStoreJson(body: Record<string, unknown>, status: number): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}

export function isLinkableProviderValue(value: string): value is LinkableAuthProvider {
  return isLinkableAuthProvider(value);
}
