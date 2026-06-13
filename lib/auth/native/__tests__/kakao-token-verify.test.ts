import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KakaoTokenVerifyError,
  verifyKakaoNativeCredential,
} from "@/lib/auth/native/kakao-token-verify.server";

describe("kakao-token-verify.server", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("verifies access token and returns kakao user id", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 987654321, app_id: 1, expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 987654321,
          kakao_account: { profile: { nickname: "BK" } },
        }),
      } as Response);

    const verified = await verifyKakaoNativeCredential({ accessToken: "valid-token" });
    expect(verified.kakaoUserId).toBe("987654321");
    expect(verified.nickname).toBe("BK");
  });

  it("throws verify failed on invalid token response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await expect(verifyKakaoNativeCredential({ accessToken: "bad" })).rejects.toBeInstanceOf(
      KakaoTokenVerifyError,
    );
  });

  it("rejects idToken-only without accessToken", async () => {
    await expect(verifyKakaoNativeCredential({ idToken: "jwt-only" })).rejects.toMatchObject({
      code: "kakao_token_missing",
    });
  });
});
