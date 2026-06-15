import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  isCallSessionHostedByActiveCallHost,
  isCommunityMessengerDedicatedCallSessionPath,
  readActiveDirectCallSessionId,
  readActiveDirectVideoCallSessionId,
  shouldSkipCallClientUnmountDispose,
  transferActiveCommunityCallToHost,
  writeActiveDirectCallSession,
  writeActiveDirectVideoCallSession,
  writeMinimizedCommunityCallSession,
} from "@/lib/community-messenger/direct-call-minimize";

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

  it("transferActiveCommunityCallToHost registers host session and detach skip", () => {
    const cleanup = vi.fn(async () => {});
    transferActiveCommunityCallToHost({ sessionId: "voice-1", cleanup });
    expect(readActiveDirectCallSessionId()).toBe("voice-1");
    expect(isCallSessionHostedByActiveCallHost("voice-1")).toBe(true);
    expect(shouldSkipCallClientUnmountDispose("voice-1")).toBe(true);
  });

  it("writeActiveDirectCallSession aliases legacy video key", () => {
    writeActiveDirectCallSession("s-voice");
    expect(readActiveDirectVideoCallSessionId()).toBe("s-voice");
  });
});
