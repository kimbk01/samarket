import { describe, expect, it } from "vitest";
import { resolvePreJoinVideoPreviewStream } from "@/lib/community-messenger/call-prejoin-video-preview";
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
});
