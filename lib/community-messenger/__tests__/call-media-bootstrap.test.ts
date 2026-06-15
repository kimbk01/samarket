import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureCallCanUseMediaMock = vi.hoisted(() =>
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

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallCanUseMedia: ensureCallCanUseMediaMock,
}));

vi.mock("@/lib/call/permission-manager", () => ({
  acquirePrimedCommunityMessengerStream: acquirePrimedMock,
}));

vi.mock("@/lib/community-messenger/call-permission", () => ({
  isCommunityMessengerCallMediaReadySync: vi.fn(() => false),
  storePrimedCommunityMessengerDeviceStream: storePrimedMock,
}));

describe("primeOutgoingCallMediaBeforeNavigate", () => {
  beforeEach(() => {
    ensureCallCanUseMediaMock.mockReset();
    ensureCallCanUseMediaMock.mockResolvedValue({ ok: true, state: {} });
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

  it("skips GUM for voice when permission check passes", async () => {
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("voice");
    expect(result).toEqual({ ok: true });
    expect(acquirePrimedMock).not.toHaveBeenCalled();
  });
});
