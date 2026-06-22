import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchToken: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  createClient: vi.fn(() => ({
    remoteUsers: [],
    on: vi.fn(),
    join: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
  })),
  joinChannel: vi.fn(async () => undefined),
  createTracks: vi.fn(async () => ({ audioTrack: { close: vi.fn() }, videoTrack: null })),
  publishTracks: vi.fn(async () => undefined),
  cleanup: vi.fn(async () => ({
    localAudioClosed: true,
    localVideoClosed: true,
    remoteTrackCount: 0,
    mediaElementCount: 0,
    audioContextState: "closed",
    speakerRestored: true,
  })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchAgoraToken: apiMocks.fetchToken,
}));

vi.mock("@/lib/community-messenger/call-provider/client-runtime", () => ({
  isCommunityMessengerAgoraAppConfigured: providerMocks.configured,
}));

vi.mock("@/lib/community-messenger/call-provider/client", () => ({
  createCommunityMessengerAgoraClient: providerMocks.createClient,
  joinCommunityMessengerAgoraChannel: providerMocks.joinChannel,
  createCommunityMessengerAgoraLocalTracks: providerMocks.createTracks,
  publishCommunityMessengerAgoraTracks: providerMocks.publishTracks,
  cleanupCommunityMessengerAgoraCallResources: providerMocks.cleanup,
}));

import {
  joinCallV3Agora,
  readCallV3AgoraGateStateForTests,
  resetCallV3AgoraForTests,
} from "@/lib/community-messenger/call-v3/call-v3-agora";

const connection = {
  provider: "agora" as const,
  appId: "app",
  channelName: "call-1",
  uid: "user-a",
  token: "token",
  expiresAt: "2026-06-23T01:00:00.000Z",
  callKind: "voice" as const,
};

describe("call-v3-agora-gate", () => {
  beforeEach(() => {
    resetCallV3AgoraForTests();
    apiMocks.fetchToken.mockReset();
    providerMocks.createClient.mockClear();
    providerMocks.joinChannel.mockClear();
    providerMocks.createTracks.mockClear();
    providerMocks.publishTracks.mockClear();
    apiMocks.fetchToken.mockResolvedValue(connection);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("fetches token once and joins once per callId", async () => {
    const first = await joinCallV3Agora("call-1");
    const second = await joinCallV3Agora("call-1");

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(apiMocks.fetchToken).toHaveBeenCalledTimes(1);
    expect(providerMocks.joinChannel).toHaveBeenCalledTimes(1);
    expect(providerMocks.publishTracks).toHaveBeenCalledTimes(1);

    const gate = readCallV3AgoraGateStateForTests();
    expect(gate.tokenFetched.has("call-1")).toBe(true);
    expect(gate.joinClaimed.has("call-1")).toBe(true);
    expect(gate.activeCallId).toBe("call-1");
  });

  it("publishes local audio once", async () => {
    await joinCallV3Agora("call-2");
    expect(providerMocks.createTracks).toHaveBeenCalledTimes(1);
    expect(providerMocks.createTracks).toHaveBeenCalledWith("voice");
    expect(providerMocks.publishTracks).toHaveBeenCalledTimes(1);
  });
});
