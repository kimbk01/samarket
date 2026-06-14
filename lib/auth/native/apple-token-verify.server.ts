import { createHash } from "node:crypto";
import { decodeJwt, type JWTPayload } from "jose";
import {
  APPLE_IDENTITY_TOKEN_ISSUER,
  isApplePrivateRelayEmail,
  resolveAppleNativeAllowedAudiences,
} from "@/lib/auth/native/apple-auth-env.server";
import { getAppleJwtVerifyKey, jwtVerify } from "@/lib/auth/native/apple-jwks.server";

export type AppleVerifiedIdentityToken = {
  sub: string;
  email: string | null;
  isPrivateRelayEmail: boolean;
  aud: string;
};

export type AppleTokenVerifyErrorCode =
  | "malformed_token"
  | "apple_token_verify_failed"
  | "apple_aud_not_allowed"
  | "apple_nonce_mismatch"
  | "apple_sub_missing";

export class AppleTokenVerifyError extends Error {
  readonly code: AppleTokenVerifyErrorCode;

  constructor(code: AppleTokenVerifyErrorCode, message: string) {
    super(message);
    this.name = "AppleTokenVerifyError";
    this.code = code;
  }
}

const MAX_TOKEN_AGE_SEC = 10 * 60;
const MAX_CLOCK_SKEW_SEC = 60;

function readAudClaim(aud: JWTPayload["aud"]): string | null {
  if (typeof aud === "string" && aud.trim()) return aud.trim();
  if (Array.isArray(aud)) {
    const hit = aud.find((value) => typeof value === "string" && value.trim());
    return typeof hit === "string" ? hit.trim() : null;
  }
  return null;
}

function hashNonceForApple(rawNonce: string): string {
  return createHash("sha256").update(rawNonce).digest("hex");
}

function assertIatValid(payload: JWTPayload): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const iat = typeof payload.iat === "number" ? payload.iat : null;
  if (iat == null) {
    throw new AppleTokenVerifyError("apple_token_verify_failed", "Apple identity token iat is missing");
  }
  if (iat > nowSec + MAX_CLOCK_SKEW_SEC) {
    throw new AppleTokenVerifyError("apple_token_verify_failed", "Apple identity token iat is in the future");
  }
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  if (exp != null && exp - iat > MAX_TOKEN_AGE_SEC + MAX_CLOCK_SKEW_SEC) {
    throw new AppleTokenVerifyError("apple_token_verify_failed", "Apple identity token lifetime is invalid");
  }
}

function assertAudAllowed(audClaim: string | null): string {
  const allowed = resolveAppleNativeAllowedAudiences();
  if (!audClaim) {
    throw new AppleTokenVerifyError("apple_token_verify_failed", "Apple identity token aud is missing");
  }
  if (allowed.length === 0) {
    throw new AppleTokenVerifyError("apple_aud_not_allowed", "Apple native aud policy is not configured");
  }
  if (!allowed.includes(audClaim)) {
    throw new AppleTokenVerifyError("apple_aud_not_allowed", "Apple identity token aud is not allowed");
  }
  return audClaim;
}

function assertNonce(payload: JWTPayload, expectedNonce: string | null | undefined): void {
  const raw = String(expectedNonce ?? "").trim();
  if (!raw) return;
  const tokenNonce = typeof payload.nonce === "string" ? payload.nonce.trim() : "";
  if (!tokenNonce) {
    throw new AppleTokenVerifyError("apple_nonce_mismatch", "Apple identity token nonce is missing");
  }
  const hashed = hashNonceForApple(raw);
  if (tokenNonce !== hashed) {
    throw new AppleTokenVerifyError("apple_nonce_mismatch", "Apple identity token nonce mismatch");
  }
}

function readSub(payload: JWTPayload): string {
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) {
    throw new AppleTokenVerifyError("apple_sub_missing", "Apple identity token sub is missing");
  }
  return sub;
}

function readEmail(payload: JWTPayload): string | null {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  return email || null;
}

function isJwtStructureMalformed(token: string): boolean {
  const parts = token.split(".");
  return parts.length !== 3 || parts.some((part) => !part.trim());
}

/**
 * Apple ASAuthorizationAppleIDCredential identityToken 검증.
 * 클라이언트 token 은 절대 신뢰하지 않는다.
 */
export async function verifyAppleIdentityToken(input: {
  identityToken: string;
  expectedNonce?: string | null;
}): Promise<AppleVerifiedIdentityToken> {
  const token = String(input.identityToken ?? "").trim();
  if (!token) {
    throw new AppleTokenVerifyError("malformed_token", "Apple identity token is missing");
  }
  if (isJwtStructureMalformed(token)) {
    throw new AppleTokenVerifyError("malformed_token", "Apple identity token is malformed");
  }

  let predecoded: JWTPayload;
  try {
    predecoded = decodeJwt(token);
  } catch {
    throw new AppleTokenVerifyError("malformed_token", "Apple identity token cannot be decoded");
  }

  const allowedAudiences = resolveAppleNativeAllowedAudiences();
  if (allowedAudiences.length === 0) {
    throw new AppleTokenVerifyError("apple_aud_not_allowed", "Apple native aud policy is not configured");
  }

  try {
    const key = await getAppleJwtVerifyKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: APPLE_IDENTITY_TOKEN_ISSUER,
      audience: allowedAudiences,
      clockTolerance: MAX_CLOCK_SKEW_SEC,
    });
    assertIatValid(payload);
    assertNonce(payload, input.expectedNonce);
    const aud = assertAudAllowed(readAudClaim(payload.aud));
    const sub = readSub(payload);
    const email = readEmail(payload);
    return {
      sub,
      email,
      isPrivateRelayEmail: isApplePrivateRelayEmail(email),
      aud,
    };
  } catch (error) {
    if (error instanceof AppleTokenVerifyError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/unexpected "aud" claim|audience/i.test(message)) {
      throw new AppleTokenVerifyError("apple_aud_not_allowed", "Apple identity token aud is not allowed");
    }
    void predecoded;
    throw new AppleTokenVerifyError(
      "apple_token_verify_failed",
      message || "Apple identity token verification failed",
    );
  }
}

export function mapAppleVerifyErrorToHttp(error: AppleTokenVerifyError): {
  errorCode: string;
  status: number;
  message: string;
} {
  if (error.code === "malformed_token") {
    return { errorCode: "malformed_token", status: 400, message: error.message };
  }
  if (error.code === "apple_aud_not_allowed") {
    return { errorCode: "apple_token_invalid_audience", status: 401, message: error.message };
  }
  return { errorCode: "apple_token_verify_failed", status: 401, message: error.message };
}
