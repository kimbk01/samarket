import { beforeEach, describe, expect, it, vi } from "vitest";

const stopRingbackMock = vi.hoisted(() => vi.fn());
const closePrimedMock = vi.hoisted(() => vi.fn());
const suspendAppCtxMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-outgoing-ringback-controller", () => ({
  stopAllOutgoingRingback: stopRingbackMock,
}));

vi.mock("@/lib/community-messenger/call-tone-web-audio", () => ({
  closePrimedWebAudioCallToneContext: closePrimedMock,
}));

vi.mock("@/lib/community-messenger/cm-app-audio-context", () => ({
  suspendCommunityMessengerAppAudioContextBestEffort: suspendAppCtxMock,
}));

describe("call-media-environment", () => {
  beforeEach(() => {
    stopRingbackMock.mockClear();
    closePrimedMock.mockClear();
    suspendAppCtxMock.mockClear();
  });

  it("stops ring tone and suspends Web Audio before Agora capture", async () => {
    const { prepareCommunityMessengerCallMediaCapture } = await import(
      "@/lib/community-messenger/call-media-environment"
    );
    prepareCommunityMessengerCallMediaCapture("agora_join_start");
    expect(stopRingbackMock).toHaveBeenCalledWith("capture_prepared");
    expect(stopRingbackMock).toHaveBeenCalledTimes(1);
    expect(closePrimedMock).toHaveBeenCalledTimes(1);
    expect(suspendAppCtxMock).toHaveBeenCalledTimes(1);
  });
});
