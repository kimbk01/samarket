/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNativeAcceptInflight,
  consumeNativeAcceptAutostart,
  isNativeAcceptInflight,
  resetNativeAcceptInflightForTests,
  seedCallV4NativeAcceptInflightFromRoute,
  setNativeAcceptInflight,
  tryStartCallV4NativeAcceptAutostart,
} from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";

describe("call-v4 native accept inflight", () => {
  beforeEach(() => {
    resetNativeAcceptInflightForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("stores, reads, consumes autostart once, and clears inflight", () => {
    setNativeAcceptInflight("call-1", "native_accept");
    expect(isNativeAcceptInflight("call-1")).toBe(true);
    expect(consumeNativeAcceptAutostart("call-1")).toBe(true);
    expect(consumeNativeAcceptAutostart("call-1")).toBe(false);
    expect(isNativeAcceptInflight("call-1")).toBe(true);
    clearNativeAcceptInflight("call-1", "connected");
    expect(isNativeAcceptInflight("call-1")).toBe(false);
  });

  it("seeds inflight from native accept route but not sheet accept", () => {
    const native = seedCallV4NativeAcceptInflightFromRoute(
      "/community-messenger/calls-v4/call-2?action=accept&source=native_accept",
    );
    expect(native).toBe("call-2");
    expect(isNativeAcceptInflight("call-2")).toBe(true);

    resetNativeAcceptInflightForTests();
    const sheet = seedCallV4NativeAcceptInflightFromRoute(
      "/community-messenger/calls-v4/call-3?action=accept&source=sheet",
    );
    expect(sheet).toBeNull();
    expect(isNativeAcceptInflight("call-3")).toBe(false);
  });

  it("tryStartCallV4NativeAcceptAutostart allows only one autostart per callId", () => {
    setNativeAcceptInflight("call-4", "native_accept");
    expect(tryStartCallV4NativeAcceptAutostart("call-4")).toBe(true);
    expect(tryStartCallV4NativeAcceptAutostart("call-4")).toBe(false);
  });

  it("emits required inflight lifecycle logs", () => {
    const info = vi.spyOn(console, "info");
    setNativeAcceptInflight("call-5", "native_accept");
    expect(tryStartCallV4NativeAcceptAutostart("call-5")).toBe(true);
    expect(tryStartCallV4NativeAcceptAutostart("call-5")).toBe(false);
    clearNativeAcceptInflight("call-5", "failed");

    expect(info.mock.calls.some((call) => call[1] === "native_accept_inflight_set")).toBe(true);
    expect(info.mock.calls.some((call) => call[1] === "native_accept_web_autostart")).toBe(true);
    expect(info.mock.calls.some((call) => call[1] === "accept_once_skip_duplicate")).toBe(true);
    expect(info.mock.calls.some((call) => call[1] === "native_accept_inflight_clear")).toBe(true);
  });
});
