import { describe, expect, it, vi } from "vitest";
import { mapOAuthStartError } from "@/lib/auth/oauth/errors";

describe("useOAuthLogin helpers", () => {
  it("maps oauth redirect mismatch to user message key path", () => {
    const t = (key: string) => key;
    expect(mapOAuthStartError("oauth_redirect_mismatch", t)).toBe(
      "auth_err_oauth_redirect_mismatch",
    );
  });

  it("maps browser open rejection", () => {
    const t = (key: string) => key;
    expect(mapOAuthStartError("browser_open_rejected", t)).toBe(
      "auth_err_oauth_browser_open_failed",
    );
  });
});
