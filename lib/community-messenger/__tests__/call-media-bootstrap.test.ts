import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureOutgoingCallMediaPermissionMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, state: {} }))
);

const acquirePrimedMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [{ kind: "video", readyState: "live", stop: vi.fn() }],
    } as unknown as MediaStream)
  )
);

const storePrimedMock = vi.hoisted(() => vi.fn());
const hasUsablePrimedMock = vi.hoisted(() => vi.fn(() => false));
const shouldDiscardPrimedMock = vi.hoisted(() => vi.fn(() => false));
const discardPrimedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureOutgoingCallMediaPermission: ensureOutgoingCallMediaPermissionMock,
  invalidateCallMediaPermissionCheckCache: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-media-stream", () => ({
  acquirePrimedCommunityMessengerStream: acquirePrimedMock,
}));

vi.mock("@/lib/community-messenger/call-permission", () => ({
  isCommunityMessengerCallMediaReadySync: vi.fn(() => false),
  storePrimedCommunityMessengerDeviceStream: storePrimedMock,
  hasUsablePrimedCommunityMessengerDeviceStream: hasUsablePrimedMock,
  shouldDiscardPrimedBeforeCommunityMessengerPrime: shouldDiscardPrimedMock,
  discardPrimedCommunityMessengerDevicePermission: discardPrimedMock,
}));

describe("primeOutgoingCallMediaBeforeNavigate", () => {
  beforeEach(() => {
    ensureOutgoingCallMediaPermissionMock.mockReset();
    ensureOutgoingCallMediaPermissionMock.mockResolvedValue({ ok: true, state: {} });
    hasUsablePrimedMock.mockReturnValue(false);
    acquirePrimedMock.mockClear();
    storePrimedMock.mockClear();
  });

  it("acquires and stores a primed video stream on user gesture path", async () => {
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("video");
    expect(result).toEqual({ ok: true });
    expect(acquirePrimedMock).toHaveBeenCalledWith("video");
    expect(storePrimedMock).toHaveBeenCalledWith("video", expect.any(Object));
  });

  it("skips GUM when a usable primed video stream already exists", async () => {
    hasUsablePrimedMock.mockReturnValue(true);

    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("video");
    expect(result).toEqual({ ok: true });
    expect(acquirePrimedMock).not.toHaveBeenCalled();
    expect(storePrimedMock).not.toHaveBeenCalled();
  });

  it("skips GUM for voice when permission check passes", async () => {
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("voice");
    expect(result).toEqual({ ok: true });
    expect(acquirePrimedMock).not.toHaveBeenCalled();
  });
});

describe("prepareCommunityMessengerOutgoingRedial", () => {
  beforeEach(() => {
    hasUsablePrimedMock.mockReturnValue(false);
    shouldDiscardPrimedMock.mockReturnValue(true);
    discardPrimedMock.mockClear();
  });

  it("invalidates cache and discards only stale primed streams", async () => {
    const { invalidateCallMediaPermissionCheckCache } = await import(
      "@/lib/community-messenger/call-media-permission-preflight"
    );
    const { prepareCommunityMessengerOutgoingRedial } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    prepareCommunityMessengerOutgoingRedial("video");
    expect(invalidateCallMediaPermissionCheckCache).toHaveBeenCalled();
    expect(discardPrimedMock).toHaveBeenCalled();
  });

  it("keeps usable primed streams on redial", async () => {
    hasUsablePrimedMock.mockReturnValue(true);
    const { prepareCommunityMessengerOutgoingRedial } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    prepareCommunityMessengerOutgoingRedial("video");
    expect(discardPrimedMock).not.toHaveBeenCalled();
  });
});
