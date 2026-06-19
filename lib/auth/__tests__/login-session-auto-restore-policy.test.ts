import { describe, expect, it } from "vitest";
import { shouldAutoRestoreLoginSessionOnMount } from "@/lib/auth/login-session-auto-restore-policy";

describe("shouldAutoRestoreLoginSessionOnMount", () => {
  it("blocks auto-restore when reason=logout", () => {
    expect(shouldAutoRestoreLoginSessionOnMount("logout", false)).toBe(false);
  });

  it("blocks auto-restore after logout landing ref is set (URL reason stripped)", () => {
    expect(shouldAutoRestoreLoginSessionOnMount("", true)).toBe(false);
    expect(shouldAutoRestoreLoginSessionOnMount(null, true)).toBe(false);
  });

  it("allows auto-restore when reason is absent and not blocked from logout landing", () => {
    expect(shouldAutoRestoreLoginSessionOnMount("", false)).toBe(true);
    expect(shouldAutoRestoreLoginSessionOnMount(null, false)).toBe(true);
    expect(shouldAutoRestoreLoginSessionOnMount(undefined, false)).toBe(true);
  });

  it("allows auto-restore for session_expired and auth_required", () => {
    expect(shouldAutoRestoreLoginSessionOnMount("session_expired", false)).toBe(true);
    expect(shouldAutoRestoreLoginSessionOnMount("auth_required", false)).toBe(true);
  });
});
