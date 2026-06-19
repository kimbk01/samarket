import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureCallMediaForUserGestureMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>(() => Promise.resolve({ ok: true, state: {} })),
);
const getCommunityMessengerUserMediaMock = vi.hoisted(() =>
  vi.fn<() => Promise<MediaStream>>(() =>
    Promise.resolve({ getTracks: () => [] } as unknown as MediaStream),
  ),
);
const peekPrimedMock = vi.hoisted(() => vi.fn(() => null as MediaStream | null));
const storePrimedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallMediaForUserGesture: ensureCallMediaForUserGestureMock,
}));

vi.mock("@/lib/community-messenger/call-permission", () => ({
  isCommunityMessengerCallMediaReadySync: vi.fn(() => true),
  peekPrimedCommunityMessengerDeviceStream: peekPrimedMock,
  storePrimedCommunityMessengerDeviceStream: storePrimedMock,
}));

vi.mock("@/lib/community-messenger/call-media-stream", () => ({
  getCommunityMessengerUserMedia: getCommunityMessengerUserMediaMock,
}));

vi.mock("@/lib/community-messenger/media-preflight", () => ({
  buildCommunityMessengerMediaStreamConstraints: vi.fn(() => ({ audio: true, video: true })),
}));

describe("call-media-bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureCallMediaForUserGestureMock.mockReset();
    ensureCallMediaForUserGestureMock.mockResolvedValue({ ok: true, state: {} });
    getCommunityMessengerUserMediaMock.mockReset();
    getCommunityMessengerUserMediaMock.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    peekPrimedMock.mockReset();
    peekPrimedMock.mockReturnValue(null);
    storePrimedMock.mockReset();
  });

  it("primeOutgoingCallMediaBeforeNavigate requests permission then primes video GUM", async () => {
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("video");
    expect(result.ok).toBe(true);
    expect(ensureCallMediaForUserGestureMock).toHaveBeenCalledWith("video");
    expect(getCommunityMessengerUserMediaMock).toHaveBeenCalled();
    expect(storePrimedMock).toHaveBeenCalled();
  });

  it("primeVideoCallMediaFromUserGesture delegates to outgoing prime", async () => {
    const { primeVideoCallMediaFromUserGesture } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeVideoCallMediaFromUserGesture({ explicitRetry: true });
    expect(result.ok).toBe(true);
    expect(ensureCallMediaForUserGestureMock).toHaveBeenCalledWith("video");
  });

  it("blocks outgoing navigation when preflight fails", async () => {
    ensureCallMediaForUserGestureMock.mockResolvedValueOnce({
      ok: false,
      reason: "permission_denied",
      state: { camera: "denied", microphone: "granted" },
    });
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("voice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("denied");
    expect(getCommunityMessengerUserMediaMock).not.toHaveBeenCalled();
  });

  it("skips GUM when video stream already primed", async () => {
    peekPrimedMock.mockReturnValueOnce({ getTracks: () => [] } as unknown as MediaStream);
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("video");
    expect(result.ok).toBe(true);
    expect(getCommunityMessengerUserMediaMock).not.toHaveBeenCalled();
  });

  it("deferVideoGum skips permission and GUM for outgoing dial video", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("video", { deferVideoGum: true });
    expect(result.ok).toBe(true);
    expect(ensureCallMediaForUserGestureMock).not.toHaveBeenCalled();
    expect(getCommunityMessengerUserMediaMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "[call-media] outgoing_video_gum_deferred",
      expect.objectContaining({ phase: "outgoing_dial" }),
    );
    infoSpy.mockRestore();
  });
});
