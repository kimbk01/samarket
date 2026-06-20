import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDockedCallSessionFlags,
  clearHostedActiveCallSession,
  clearPipMinimizedCallSessionFlags,
  clearAllCommunityCallLocalSessionFlags,
  isCallSessionHostedByActiveCallHost,
  isCommunityMessengerDedicatedCallSessionPath,
  shouldSkipCallClientUnmountDispose,
  writeActiveDirectVideoCallSession,
  writeDockedCallSession,
  writeMinimizedCommunityCallSession,
} from "@/lib/community-messenger/direct-call-minimize";
import { writeTerminalCallRecoverySuppress } from "@/lib/community-messenger/call-active-session-recovery";

function createSessionStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("direct-call-minimize host ownership", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createSessionStorageStub());
  });

  afterEach(() => {
    clearAllCommunityCallLocalSessionFlags();
    vi.unstubAllGlobals();
  });

  it("isCommunityMessengerDedicatedCallSessionPath matches calls route session id", () => {
    expect(
      isCommunityMessengerDedicatedCallSessionPath(
        "/community-messenger/calls/sess-abc",
        "sess-abc"
      )
    ).toBe(true);
    expect(
      isCommunityMessengerDedicatedCallSessionPath(
        "/community-messenger/calls/sess-abc",
        "other"
      )
    ).toBe(false);
    expect(isCommunityMessengerDedicatedCallSessionPath("/community-messenger/rooms/r1", "sess-abc")).toBe(
      false
    );
    expect(isCommunityMessengerDedicatedCallSessionPath("/community-messenger/calls/outgoing", "x")).toBe(
      false
    );
  });

  it("isCallSessionHostedByActiveCallHost reflects sessionStorage flags", () => {
    expect(isCallSessionHostedByActiveCallHost("s1")).toBe(false);
    writeActiveDirectVideoCallSession("s1");
    expect(isCallSessionHostedByActiveCallHost("s1")).toBe(true);
    expect(isCallSessionHostedByActiveCallHost("s2")).toBe(false);
    clearAllCommunityCallLocalSessionFlags();
    writeMinimizedCommunityCallSession("s3");
    expect(isCallSessionHostedByActiveCallHost("s3")).toBe(true);
  });

  it("hostedActive only should not skip unmount dispose", () => {
    writeActiveDirectVideoCallSession("s-host");
    expect(shouldSkipCallClientUnmountDispose("s-host")).toBe(false);
  });

  it("docked retained session should skip unmount dispose", () => {
    writeDockedCallSession("s-dock");
    expect(shouldSkipCallClientUnmountDispose("s-dock")).toBe(true);
  });

  it("pip retained session should skip unmount dispose", () => {
    writeMinimizedCommunityCallSession("s-pip");
    expect(shouldSkipCallClientUnmountDispose("s-pip")).toBe(true);
  });

  it("terminal suppressed + hostedActive should not skip unmount dispose", () => {
    writeActiveDirectVideoCallSession("s-term");
    writeTerminalCallRecoverySuppress("s-term");
    expect(shouldSkipCallClientUnmountDispose("s-term")).toBe(false);
  });

  it("stale hosted only should not skip unmount dispose", () => {
    writeActiveDirectVideoCallSession("s-stale");
    clearDockedCallSessionFlags();
    clearPipMinimizedCallSessionFlags();
    expect(shouldSkipCallClientUnmountDispose("s-stale")).toBe(false);
    clearHostedActiveCallSession();
  });
});
