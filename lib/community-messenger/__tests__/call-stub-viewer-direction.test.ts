import { describe, expect, it } from "vitest";
import {
  resolveCallStubViewerIsCaller,
  withCallStubViewerDirection,
} from "@/lib/community-messenger/call-stub-viewer-direction";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const meta = { initiatorUserId: "caller", recipientUserId: "callee" };

/** Owner 실통화 room 3932dd99 — 2026-10-14 APK↔iPhone 세션 payload */
const OWNER_WWWW = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const OWNER_AAAA = "11111111-1111-1111-1111-111111111111";

function stub(partial: {
  id: string;
  senderId: string;
  initiatorUserId: string;
  recipientUserId: string;
  content: string;
  viewerUserId: string;
}): CommunityMessengerMessage {
  const isMine = partial.senderId.toLowerCase() === partial.viewerUserId.toLowerCase();
  return {
    id: partial.id,
    roomId: "3932dd99-2a06-402a-8041-e3f27af2fa81",
    senderId: partial.senderId,
    senderLabel: isMine ? "나" : "상대",
    messageType: "call_stub",
    content: partial.content,
    createdAt: "2026-10-14T04:50:07.917+00:00",
    isMine,
    callKind: "voice",
    callStatus: "ended",
    metadata: {
      callKind: "voice",
      callStatus: "ended",
      initiatorUserId: partial.initiatorUserId,
      recipientUserId: partial.recipientUserId,
      sessionId: partial.id,
    },
  };
}

describe("resolveCallStubViewerIsCaller", () => {
  it("declined (stub author = callee): callee sees incoming, caller sees outgoing", () => {
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: true, senderId: "callee", metadata: meta })).toBe(false);
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: false, senderId: "callee", metadata: meta })).toBe(true);
  });
  it("ended/cancelled by caller (stub author = caller)", () => {
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: true, senderId: "caller", metadata: meta })).toBe(true);
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: false, senderId: "caller", metadata: meta })).toBe(false);
  });
  it("falls back to isMine without initiator or for non call_stub", () => {
    expect(resolveCallStubViewerIsCaller({ messageType: "call_stub", isMine: true, senderId: "x", metadata: {} })).toBe(true);
    expect(resolveCallStubViewerIsCaller({ messageType: "text", isMine: false, senderId: "caller", metadata: meta })).toBe(false);
  });

  it("Owner APK→iPhone ended stub: aaaa sees 수신, wwww sees 발신 (fixes Production flip)", () => {
    const forAaaa = stub({
      id: "58fba4c8-6168-4d6a-b6b5-3999e104764d",
      senderId: OWNER_AAAA,
      initiatorUserId: OWNER_WWWW,
      recipientUserId: OWNER_AAAA,
      content: "음성 통화 · 2m 09s",
      viewerUserId: OWNER_AAAA,
    });
    const forWwww = { ...forAaaa, isMine: false, senderLabel: "상대" };
    expect(forAaaa.isMine).toBe(true);
    expect(withCallStubViewerDirection(forAaaa).isMine).toBe(false);
    expect(withCallStubViewerDirection(forWwww).isMine).toBe(true);
  });

  it("Owner iPhone→APK ended stub: aaaa sees 발신, wwww sees 수신", () => {
    const forAaaa = stub({
      id: "e21c7c46-465b-4e3b-a2e6-02c0bc0aad5e",
      senderId: OWNER_AAAA,
      initiatorUserId: OWNER_AAAA,
      recipientUserId: OWNER_WWWW,
      content: "영상 통화 · 1m 33s",
      viewerUserId: OWNER_AAAA,
    });
    const forWwww = { ...forAaaa, isMine: false, senderLabel: "상대" };
    expect(withCallStubViewerDirection(forAaaa).isMine).toBe(true);
    expect(withCallStubViewerDirection(forWwww).isMine).toBe(false);
  });
});
