import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/oauth/oauth-native-callback-log", () => ({
  logOAuthNativeEvent: vi.fn(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveOAuthRoutingShellPlatform: () => "ios",
}));

import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  beginAuthLifecycleFlow,
  markAuthLifecycleStage,
  redactAuthLifecycleDetail,
  resetAuthLifecycleForTests,
  getActiveAuthFlowId,
  failAuthLifecycle,
} from "@/lib/auth/oauth/auth-lifecycle-trace";

describe("auth-lifecycle-trace", () => {
  beforeEach(() => {
    resetAuthLifecycleForTests();
    vi.mocked(logOAuthNativeEvent).mockClear();
  });

  it("redacts token-like fields", () => {
    const out = redactAuthLifecycleDetail({
      identityToken: "aaa.bbb.ccc",
      hasIdentityToken: true,
      email: "a@b.com",
    });
    expect(String(out.identityToken)).toContain("redacted");
    expect(out.hasIdentityToken).toBe(true);
    expect(String(out.email)).toContain("redacted");
  });

  it("emits stages with stable authFlowId", () => {
    const id = beginAuthLifecycleFlow({ provider: "apple" });
    expect(id).toMatch(/^af_/);
    markAuthLifecycleStage("login_button_tapped");
    markAuthLifecycleStage("routing_decision_completed", { action: "native_provider_login" });
    expect(getActiveAuthFlowId()).toBe(id);
    failAuthLifecycle("apple_native_unavailable");
    expect(vi.mocked(logOAuthNativeEvent).mock.calls.some((c) => c[0] === "auth_lifecycle")).toBe(true);
    expect(vi.mocked(logOAuthNativeEvent).mock.calls.some((c) => c[0] === "auth_lifecycle_complete")).toBe(true);
  });
});
