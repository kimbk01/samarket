import { describe, expect, it } from "vitest";
import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";

describe("shouldClearProfileCacheOnGetUserFailure", () => {
  it("does not clear cache when user is missing without error (soft unknown)", () => {
    expect(shouldClearProfileCacheOnGetUserFailure(null, null)).toBe(false);
    expect(shouldClearProfileCacheOnGetUserFailure(undefined, undefined)).toBe(false);
  });

  it("does not clear cache on network-like failures", () => {
    expect(
      shouldClearProfileCacheOnGetUserFailure(null, { message: "Failed to fetch", status: undefined })
    ).toBe(false);
    expect(shouldClearProfileCacheOnGetUserFailure(null, { message: "timeout", status: 503 })).toBe(false);
  });

  it("clears cache on terminal refresh token errors", () => {
    expect(
      shouldClearProfileCacheOnGetUserFailure(null, {
        message: "Invalid Refresh Token",
        code: "refresh_token_not_found",
        status: 400,
      })
    ).toBe(true);
  });
});
