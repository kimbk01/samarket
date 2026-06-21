import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCommunityMessengerCallRouteHref,
  primeCommunityMessengerCallNavigationSeed,
  shouldSkipCallRouteEnterSlide,
} from "@/lib/community-messenger/call-session-navigation-seed";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

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

describe("call route enter slide skip", () => {
  beforeEach(() => {
    const sessionStorage = createSessionStorageStub();
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("window", { sessionStorage } as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not skip slide from tmp/outgoingDial route hacks", () => {
    expect(shouldSkipCallRouteEnterSlide("tmp_outgoing_abc", { get: () => null })).toBe(false);
    expect(
      shouldSkipCallRouteEnterSlide("real-session-id", { get: (k) => (k === "outgoingDial" ? "1" : null) })
    ).toBe(false);
  });

  it("buildCommunityMessengerCallRouteHref returns real session route only", () => {
    expect(buildCommunityMessengerCallRouteHref("sess-1")).toBe("/community-messenger/calls/sess-1");
  });

  it("skips slide when navigation seed is outgoing initiator", () => {
    const session = {
      id: "sess-2",
      status: "ringing",
      isMineInitiator: true,
    } as CommunityMessengerCallSession;
    primeCommunityMessengerCallNavigationSeed("sess-2", session);
    expect(shouldSkipCallRouteEnterSlide("sess-2", { get: () => null })).toBe(true);
  });
});
