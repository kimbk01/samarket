import { describe, expect, it } from "vitest";
import { mapOAuthErrorToMessage } from "@/lib/auth/oauth/use-oauth-login";

const t = ((key: string) => key) as Parameters<typeof mapOAuthErrorToMessage>[1];

describe("mapOAuthErrorToMessage — Apple 창 안 실패", () => {
  it("apple_native_config_error·token_missing 은 「완료되지 않음」 문구 (시작 실패 아님)", () => {
    expect(mapOAuthErrorToMessage("apple_native_config_error", t)).toBe("auth_err_apple_native_not_completed");
    expect(mapOAuthErrorToMessage("apple_native_token_missing", t)).toBe("auth_err_apple_native_not_completed");
  });

  it("다른 Apple 오류 문구는 그대로", () => {
    expect(mapOAuthErrorToMessage("apple_native_unavailable", t)).toBe("auth_err_apple_native_unavailable");
    expect(mapOAuthErrorToMessage("apple_native_verify_failed", t)).toBe("auth_err_apple_native_verify_failed");
    expect(mapOAuthErrorToMessage("oauth_flow_in_flight", t)).toBe("auth_err_oauth_start_failed");
  });
});
