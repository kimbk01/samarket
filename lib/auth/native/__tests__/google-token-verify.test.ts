import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoogleTokenVerifyError,
  verifyGoogleIdToken,
} from "@/lib/auth/native/google-token-verify.server";

const TEST_AUD = "1234567890-test.apps.googleusercontent.com";

describe("google-token-verify.server", () => {
  beforeEach(() => {
    process.env.AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID = TEST_AUD;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID;
    delete process.env.AUTH_GOOGLE_NATIVE_AUDIENCES;
  });

  it("verifies a valid Google id token payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: "google-user-1",
          aud: TEST_AUD,
          iss: "https://accounts.google.com",
          exp: String(Math.floor(Date.now() / 1000) + 3600),
          email: "user@example.com",
          email_verified: "true",
          name: "Test User",
        }),
      }),
    );

    const verified = await verifyGoogleIdToken({ idToken: "token-abc" });
    expect(verified.googleUserId).toBe("google-user-1");
    expect(verified.audience).toBe(TEST_AUD);
    expect(verified.emailVerified).toBe(true);
  });

  it("rejects invalid audience", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: "google-user-1",
          aud: "wrong-client.apps.googleusercontent.com",
          iss: "accounts.google.com",
          exp: String(Math.floor(Date.now() / 1000) + 3600),
        }),
      }),
    );

    await expect(verifyGoogleIdToken({ idToken: "token-abc" })).rejects.toMatchObject({
      code: "google_token_invalid_audience",
    } satisfies Partial<GoogleTokenVerifyError>);
  });

  it("rejects missing token", async () => {
    await expect(verifyGoogleIdToken({ idToken: "" })).rejects.toMatchObject({
      code: "google_token_missing",
    });
  });
});
