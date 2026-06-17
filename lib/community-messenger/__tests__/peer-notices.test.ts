import { describe, expect, it } from "vitest";
import {
  isViewerRecipientOfInboundDirectChat,
  shouldShowUnknownPeerNotice,
} from "@/lib/community-messenger/peer-notices";

describe("shouldShowUnknownPeerNotice", () => {
  it("hides when peer is saved as friend", () => {
    expect(
      shouldShowUnknownPeerNotice({
        isFriend: true,
        blockedByMe: false,
        dismissed: false,
        isRecipient: true,
      })
    ).toBe(false);
  });

  it("hides when viewer dismissed the notice", () => {
    expect(
      shouldShowUnknownPeerNotice({
        isFriend: false,
        blockedByMe: false,
        dismissed: true,
        isRecipient: true,
      })
    ).toBe(false);
  });

  it("hides when blocked (block bar is separate)", () => {
    expect(
      shouldShowUnknownPeerNotice({
        isFriend: false,
        blockedByMe: true,
        dismissed: false,
        isRecipient: true,
      })
    ).toBe(false);
  });

  it("hides for initiator who started the chat", () => {
    expect(
      shouldShowUnknownPeerNotice({
        isFriend: false,
        blockedByMe: false,
        dismissed: false,
        isRecipient: false,
      })
    ).toBe(false);
  });

  it("shows for inbound recipient with unsaved peer", () => {
    expect(
      shouldShowUnknownPeerNotice({
        isFriend: false,
        blockedByMe: false,
        dismissed: false,
        isRecipient: true,
      })
    ).toBe(true);
  });
});

describe("isViewerRecipientOfInboundDirectChat", () => {
  const viewer = "viewer-uuid";
  const peer = "peer-uuid";

  it("returns false when room has no chat messages", () => {
    expect(
      isViewerRecipientOfInboundDirectChat({ viewerUserId: viewer, peerUserId: peer, messages: [] })
    ).toBe(false);
  });

  it("returns false when viewer sent the first message", () => {
    expect(
      isViewerRecipientOfInboundDirectChat({
        viewerUserId: viewer,
        peerUserId: peer,
        messages: [
          {
            senderId: viewer,
            messageType: "text",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    ).toBe(false);
  });

  it("returns true when peer sent the first message", () => {
    expect(
      isViewerRecipientOfInboundDirectChat({
        viewerUserId: viewer,
        peerUserId: peer,
        messages: [
          {
            senderId: peer,
            messageType: "text",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            senderId: viewer,
            messageType: "text",
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      })
    ).toBe(true);
  });

  it("ignores system and call_stub when finding first message", () => {
    expect(
      isViewerRecipientOfInboundDirectChat({
        viewerUserId: viewer,
        peerUserId: peer,
        messages: [
          {
            senderId: viewer,
            messageType: "system",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            senderId: peer,
            messageType: "text",
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      })
    ).toBe(true);
  });
});
