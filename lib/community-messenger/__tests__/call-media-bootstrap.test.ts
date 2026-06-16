import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureCallCanUseMediaMock = vi.hoisted(() => vi.fn<() => Promise<unknown>>(() => Promise.resolve({ ok: true, state: {} })));

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallCanUseMedia: ensureCallCanUseMediaMock,
}));

vi.mock("@/lib/community-messenger/call-permission", () => ({
  isCommunityMessengerCallMediaReadySync: vi.fn(() => true),
}));

describe("call-media-bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureCallCanUseMediaMock.mockReset();
    ensureCallCanUseMediaMock.mockResolvedValue({ ok: true, state: {} });
  });

  it("primeOutgoingCallMediaBeforeNavigate uses check-only preflight", async () => {
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeOutgoingCallMediaBeforeNavigate("video");
    expect(result.ok).toBe(true);
    expect(ensureCallCanUseMediaMock).toHaveBeenCalledWith("video");
  });

  it("primeVideoCallMediaFromUserGesture delegates to check-only preflight", async () => {
    const { primeVideoCallMediaFromUserGesture } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeVideoCallMediaFromUserGesture({ explicitRetry: true });
    expect(result.ok).toBe(true);
    expect(ensureCallCanUseMediaMock).toHaveBeenCalledWith("video");
  });

  it("blocks outgoing navigation when preflight fails", async () => {
    ensureCallCanUseMediaMock.mockResolvedValueOnce({
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
  });
});
