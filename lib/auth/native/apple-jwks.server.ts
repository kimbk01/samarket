import { createRemoteJWKSet, type JSONWebKeySet, importJWK, jwtVerify, type JWTVerifyGetKey } from "jose";
import { APPLE_JWKS_URL } from "@/lib/auth/native/apple-auth-env.server";

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let testJwksGetter: JWTVerifyGetKey | null = null;
let jwksFetchedAt = 0;

export function __setAppleJwksForTests(getter: JWTVerifyGetKey | null): void {
  testJwksGetter = getter;
}

export function __resetAppleJwksForTests(): void {
  testJwksGetter = null;
  remoteJwks = null;
  jwksFetchedAt = 0;
}

function getRemoteJwks(): ReturnType<typeof createRemoteJWKSet> {
  const now = Date.now();
  if (!remoteJwks || now - jwksFetchedAt > JWKS_CACHE_TTL_MS) {
    remoteJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    jwksFetchedAt = now;
  }
  return remoteJwks;
}

export async function getAppleJwtVerifyKey(): Promise<JWTVerifyGetKey> {
  if (testJwksGetter) return testJwksGetter;
  return getRemoteJwks();
}

export async function createLocalAppleJwksGetterFromKey(
  privateKey: CryptoKey,
  kid = "test-kid",
): Promise<JWTVerifyGetKey> {
  return async (protectedHeader) => {
    if (protectedHeader.kid !== kid) {
      throw new Error("jwks_kid_mismatch");
    }
    return privateKey;
  };
}

/** unit test — 로컬 RSA 키로 서명한 JWT 검증용 */
export async function createLocalAppleJwksGetterFromJwk(
  privateJwk: JSONWebKeySet["keys"][number] & { d: string; kid?: string },
): Promise<JWTVerifyGetKey> {
  const key = await importJWK(privateJwk, "RS256");
  const kid = String(privateJwk.kid ?? "test-kid");
  return async (protectedHeader) => {
    if (protectedHeader.kid !== kid) {
      throw new Error("jwks_kid_mismatch");
    }
    return key;
  };
}

export { jwtVerify };
