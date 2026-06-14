import { describe, expect, it } from "vitest";
import { resolvePostLoginTarget, resolveSafeReturnTo } from "@/lib/auth/post-login-redirect";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";

describe("post-login-redirect", () => {
  it("POST_LOGIN_PATH is root", () => {
    expect(POST_LOGIN_PATH).toBe("/");
  });

  it("resolveSafeReturnTo sanitizes internal paths", () => {
    expect(resolveSafeReturnTo("/market")).toBe("/market");
    expect(resolveSafeReturnTo("//evil.com")).toBeNull();
  });

  it("resolvePostLoginTarget without session goes to login error", () => {
    expect(
      resolvePostLoginTarget({
        hasSession: false,
        status: null,
        next: "/market",
      })
    ).toContain("/login");
  });
});
