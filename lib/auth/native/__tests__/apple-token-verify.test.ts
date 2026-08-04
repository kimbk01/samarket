import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  __resetAppleJwksForTests,
  __setAppleJwksForTests,
  createLocalAppleJwksGetterFromKey,
} from "@/lib/auth/native/apple-jwks.server";
import {
  AppleTokenVerifyError,
  verifyAppleIdentityToken,
} from "@/lib/auth/native/apple-token-verify.server";

const TEST_AUD = "com.dibay.app";
const TEST_SUB = "001234.apple-sub-abc";

describe("apple-token-verify.server", () => {
  let signToken: (claims: Record<string, unknown>, options?: { expiresInSec?: number; aud?: string }) => Promise<string>;

  beforeAll(async () => {
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID = TEST_AUD;
    process.env.AUTH_APPLE_NATIVE_AUDIENCES = TEST_AUD;

    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    __setAppleJwksForTests(await createLocalAppleJwksGetterFromKey(publicKey, "test-kid"));

    signToken = async (claims, options) => {
      const now = Math.floor(Date.now() / 1000);
      const expiresInSec = options?.expiresInSec ?? 600;
      const aud = options?.aud ?? TEST_AUD;
      return new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
        .setIssuer("https://appleid.apple.com")
        .setAudience(aud)
        .setSubject(TEST_SUB)
        .setIssuedAt(now)
        .setExpirationTime(now + expiresInSec)
        .sign(privateKey);
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    __resetAppleJwksForTests();
    delete process.env.AUTH_APPLE_NATIVE_CLIENT_ID;
    delete process.env.AUTH_APPLE_NATIVE_AUDIENCES;
  });

  it("returns 400 when token missing", async () => {
    await expect(verifyAppleIdentityToken({ identityToken: "" })).rejects.toMatchObject({
      code: "malformed_token",
    });
  });

  it("returns 400 for malformed token", async () => {
    await expect(verifyAppleIdentityToken({ identityToken: "not-a-jwt" })).rejects.toMatchObject({
      code: "malformed_token",
    });
  });

  it("returns 401 for invalid aud", async () => {
    const token = await signToken({ email: "user@example.com" });
    delete process.env.AUTH_APPLE_NATIVE_CLIENT_ID;
    process.env.AUTH_APPLE_NATIVE_AUDIENCES = "com.other.app";
    await expect(verifyAppleIdentityToken({ identityToken: token })).rejects.toMatchObject({
      code: "apple_aud_not_allowed",
    });
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID = TEST_AUD;
    process.env.AUTH_APPLE_NATIVE_AUDIENCES = TEST_AUD;
  });

  it("rejects Web OAuth Services ID aud com.dibay.login2 for Native exchange", async () => {
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID = TEST_AUD;
    process.env.AUTH_APPLE_WEB_CLIENT_ID = "com.dibay.login2";
    const webAudToken = await signToken({}, { aud: "com.dibay.login2" });

    await expect(verifyAppleIdentityToken({ identityToken: webAudToken })).rejects.toMatchObject({
      code: "apple_aud_not_allowed",
    });
  });

  it("accepts Native aud com.dibay.app even when AUTH_APPLE_WEB_CLIENT_ID is set", async () => {
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID = TEST_AUD;
    process.env.AUTH_APPLE_WEB_CLIENT_ID = "com.dibay.login2";
    const token = await signToken({});
    const verified = await verifyAppleIdentityToken({ identityToken: token });
    expect(verified.aud).toBe(TEST_AUD);
  });

  it("returns 401 for expired token", async () => {
    const token = await signToken({}, { expiresInSec: -120 });
    await expect(verifyAppleIdentityToken({ identityToken: token })).rejects.toMatchObject({
      code: "apple_token_verify_failed",
    });
  });

  it("returns 401 for nonce mismatch", async () => {
    const rawNonce = "dibay-test-nonce";
    const wrongHash = createHash("sha256").update("other-nonce").digest("hex");
    const token = await signToken({ nonce: wrongHash });
    await expect(
      verifyAppleIdentityToken({ identityToken: token, expectedNonce: rawNonce }),
    ).rejects.toMatchObject({
      code: "apple_nonce_mismatch",
    });
  });

  it("verifies valid token and extracts provider_user_id (sub)", async () => {
    const rawNonce = "dibay-valid-nonce";
    const nonceHash = createHash("sha256").update(rawNonce).digest("hex");
    const token = await signToken({
      nonce: nonceHash,
      email: "relay@privaterelay.appleid.com",
    });
    const verified = await verifyAppleIdentityToken({
      identityToken: token,
      expectedNonce: rawNonce,
    });
    expect(verified.sub).toBe(TEST_SUB);
    expect(verified.email).toBe("relay@privaterelay.appleid.com");
    expect(verified.isPrivateRelayEmail).toBe(true);
    expect(verified.aud).toBe(TEST_AUD);
  });

  it("accepts Apple identity token with 24h exp−iat claim window (jose exp still valid)", async () => {
    const token = await signToken({}, { expiresInSec: 86_400 });
    const verified = await verifyAppleIdentityToken({ identityToken: token });
    expect(verified.sub).toBe(TEST_SUB);
    expect(verified.aud).toBe(TEST_AUD);
  });

  it("classifies verify errors for HTTP mapping", () => {
    const malformed = new AppleTokenVerifyError("malformed_token", "bad");
    const invalid = new AppleTokenVerifyError("apple_token_verify_failed", "bad");
    expect(malformed.code).toBe("malformed_token");
    expect(invalid.code).toBe("apple_token_verify_failed");
  });
});
