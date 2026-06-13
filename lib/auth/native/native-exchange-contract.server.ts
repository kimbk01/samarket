import type { NativeExchangeProvider, NativeExchangeRequest } from "@/lib/auth/native/native-exchange-types.server";
import { normalizeNativeExchangeProvider } from "@/lib/auth/native/native-exchange-types.server";

function readNonEmptyString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * POST /api/auth/native/exchange 공통 request 파싱.
 * Naver 는 native exchange 대상이 아니다.
 */
export function parseNativeExchangeRequest(body: Record<string, unknown>): NativeExchangeRequest | null {
  const provider = normalizeNativeExchangeProvider(body.provider);
  if (!provider) return null;

  return {
    provider,
    token: readNonEmptyString(body.token),
    idToken: readNonEmptyString(body.idToken),
    accessToken: readNonEmptyString(body.accessToken),
    identityToken: readNonEmptyString(body.identityToken),
    authorizationCode: readNonEmptyString(body.authorizationCode),
    nonce: readNonEmptyString(body.nonce),
    userIdentifier: readNonEmptyString(body.userIdentifier),
    next: typeof body.next === "string" ? body.next : null,
  };
}

/** provider별 필수 credential — 없으면 null (400) */
export function resolveNativeExchangeCredential(
  input: NativeExchangeRequest,
): string | null {
  const generic = readNonEmptyString(input.token);
  if (input.provider === "apple") {
    return readNonEmptyString(input.identityToken ?? input.idToken ?? input.token);
  }
  if (input.provider === "kakao") {
    return readNonEmptyString(input.accessToken ?? input.idToken ?? input.token);
  }
  if (input.provider === "google") {
    return readNonEmptyString(input.idToken ?? input.token);
  }
  if (input.provider === "facebook") {
    return readNonEmptyString(input.accessToken ?? input.token);
  }
  return generic;
}

export function missingCredentialMessage(provider: NativeExchangeProvider): string {
  if (provider === "apple") return "Apple identity token is required";
  if (provider === "kakao") return "Kakao access token or id token is required";
  if (provider === "google") return "Google id token is required";
  return "Facebook access token is required";
}
