import { describe, expect, it, vi, beforeEach } from "vitest";
import { isPushDispatchEnabled } from "@/lib/push/dispatch/dispatch-push-for-user";

describe("push dispatch gate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("enabled when PUSH_DISPATCH_ENABLED=1", () => {
    vi.stubEnv("PUSH_DISPATCH_ENABLED", "1");
    expect(isPushDispatchEnabled()).toBe(true);
  });

  it("enabled when WEB_PUSH_ENABLED=1", () => {
    vi.stubEnv("WEB_PUSH_ENABLED", "1");
    expect(isPushDispatchEnabled()).toBe(true);
  });

  it("disabled when neither flag set", () => {
    vi.stubEnv("PUSH_DISPATCH_ENABLED", "");
    vi.stubEnv("WEB_PUSH_ENABLED", "");
    expect(isPushDispatchEnabled()).toBe(false);
  });
});
