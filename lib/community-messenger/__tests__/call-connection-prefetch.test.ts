import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommunityMessengerManagedCallConnection } from "@/lib/community-messenger/types";

const fetchGroupAgoraConnectionMock = vi.fn();

vi.mock("@/lib/community-messenger/call-provider/client", () => ({
  createCommunityMessengerAgoraClient: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-provider/group-agora-session", () => ({
  fetchGroupAgoraConnection: (...args: unknown[]) => fetchGroupAgoraConnectionMock(...args),
}));

const connection: CommunityMessengerManagedCallConnection = {
  provider: "agora",
  appId: "app",
  channelName: "ch",
  token: "tok",
  uid: "1",
  expiresAt: null,
  callKind: "video",
};

describe("call-connection-prefetch", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchGroupAgoraConnectionMock.mockReset();
  });

  it("primeCommunityMessengerCallConnectionPrefetch stores resolved connection", async () => {
    fetchGroupAgoraConnectionMock.mockResolvedValue(connection);
    const mod = await import("@/lib/community-messenger/call-connection-prefetch");
    mod.primeCommunityMessengerCallConnectionPrefetch("sess-1");
    await vi.waitFor(() => {
      expect(mod.peekPrefetchedCommunityMessengerCallConnection("sess-1")).toEqual(connection);
    });
  });

  it("resolveCommunityMessengerCallConnection prefers ref then module prefetch", async () => {
    fetchGroupAgoraConnectionMock.mockResolvedValue(connection);
    const mod = await import("@/lib/community-messenger/call-connection-prefetch");
    mod.primeCommunityMessengerCallConnectionPrefetch("sess-2");
    await vi.waitFor(() => {
      expect(mod.peekPrefetchedCommunityMessengerCallConnection("sess-2")).toEqual(connection);
    });

    const fresh = vi.fn(async () => connection);
    const resolved = await mod.resolveCommunityMessengerCallConnection({
      sessionId: "sess-2",
      fetchFresh: fresh,
    });
    expect(resolved).toEqual(connection);
    expect(fresh).not.toHaveBeenCalled();
  });

  it("resolveCommunityMessengerCallConnection uses fetchFresh when prefetch missing", async () => {
    const mod = await import("@/lib/community-messenger/call-connection-prefetch");
    const fresh = vi.fn(async () => connection);
    const resolved = await mod.resolveCommunityMessengerCallConnection({
      sessionId: "sess-3",
      fetchFresh: fresh,
    });
    expect(resolved).toEqual(connection);
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
