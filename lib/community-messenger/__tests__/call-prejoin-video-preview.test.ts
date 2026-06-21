import { describe, expect, it } from "vitest";
import {
  hasLiveCommunityMessengerVideoPreviewStream,
  resolvePreJoinVideoPreviewStream,
  shouldPreserveHeldPreJoinVideoOnSessionRouteChange,
  shouldShowOutgoingRingCameraPreview,
} from "@/lib/community-messenger/call-prejoin-video-preview";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(
  partial: Partial<CommunityMessengerCallSession> & Pick<CommunityMessengerCallSession, "status">
): CommunityMessengerCallSession {
  const { status, ...rest } = partial;
  return {
    id: "s1",
    roomId: "r1",
    sessionMode: "direct",
    callKind: "video",
    initiatorUserId: "a",
    recipientUserId: "b",
    peerUserId: "b",
    peerLabel: "B",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    isMineInitiator: true,
    participants: [],
    status,
    ...rest,
  };
}

function fakeStream(live = true): MediaStream {
  const track = { readyState: live ? "live" : "ended", kind: "video" } as MediaStreamTrack;
  return {
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

describe("resolvePreJoinVideoPreviewStream", () => {
  it("shows preview during active before localVideoPlaying", () => {
    const stream = fakeStream();
    const out = resolvePreJoinVideoPreviewStream({
      session: session({ status: "active", isMineInitiator: true }),
      localVideoPlaying: false,
      peekStream: null,
      heldStream: stream,
    });
    expect(out).toBe(stream);
  });

  it("keeps preview during join busy when local video not playing yet", () => {
    const stream = fakeStream();
    expect(
      resolvePreJoinVideoPreviewStream({
        session: session({ status: "active" }),
        localVideoPlaying: false,
        peekStream: stream,
        heldStream: null,
      })
    ).toBe(stream);
  });

  it("clears when localVideoPlaying", () => {
    expect(
      resolvePreJoinVideoPreviewStream({
        session: session({ status: "active" }),
        localVideoPlaying: true,
        peekStream: fakeStream(),
        heldStream: fakeStream(),
      })
    ).toBeNull();
  });

  it("shows preview for outgoing initiator while ringing", () => {
    const stream = fakeStream();
    expect(
      resolvePreJoinVideoPreviewStream({
        session: session({ status: "ringing", isMineInitiator: true }),
        localVideoPlaying: false,
        peekStream: null,
        heldStream: stream,
      })
    ).toBe(stream);
  });

  it("shouldShowOutgoingRingCameraPreview accepts held previewStream", () => {
    const stream = fakeStream();
    expect(
      shouldShowOutgoingRingCameraPreview({
        callKind: "video",
        sessionStatus: "ringing",
        isInitiator: true,
        previewStream: stream,
      })
    ).toBe(true);
  });
});

describe("hasLiveCommunityMessengerVideoPreviewStream", () => {
  it("returns true for live video tracks", () => {
    expect(hasLiveCommunityMessengerVideoPreviewStream(fakeStream(true))).toBe(true);
  });

  it("returns false for ended tracks", () => {
    expect(hasLiveCommunityMessengerVideoPreviewStream(fakeStream(false))).toBe(false);
  });
});

describe("shouldPreserveHeldPreJoinVideoOnSessionRouteChange", () => {
  it("preserves preview across tmp to real session replace", () => {
    const stream = fakeStream();
    expect(
      shouldPreserveHeldPreJoinVideoOnSessionRouteChange({
        nextSessionId: "real-session-id",
        prevSessionId: "tmp_abc",
        peekStream: stream,
        heldStream: null,
      })
    ).toBe(true);
  });

  it("does not preserve when stream is ended", () => {
    expect(
      shouldPreserveHeldPreJoinVideoOnSessionRouteChange({
        nextSessionId: "real-session-id",
        prevSessionId: "tmp_abc",
        peekStream: fakeStream(false),
        heldStream: null,
      })
    ).toBe(false);
  });

  it("preserves primed preview on first route mount", () => {
    expect(
      shouldPreserveHeldPreJoinVideoOnSessionRouteChange({
        nextSessionId: "tmp_abc",
        prevSessionId: null,
        peekStream: fakeStream(),
        heldStream: null,
      })
    ).toBe(true);
  });

  it("does not preserve across unrelated session switches", () => {
    expect(
      shouldPreserveHeldPreJoinVideoOnSessionRouteChange({
        nextSessionId: "call-b",
        prevSessionId: "call-a",
        peekStream: fakeStream(),
        heldStream: null,
      })
    ).toBe(false);
  });
});
