import { describe, expect, it } from "vitest";
import { canonicalRoomListPreviewFromMessageFields } from "@/lib/community-messenger/room-list-semantic-preview";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

describe("canonicalRoomListPreviewFromMessageFields", () => {
  it("image → semantic photo token, not URL", () => {
    const out = canonicalRoomListPreviewFromMessageFields({
      messageType: "image",
      content: "https://cdn.example.com/a.jpg",
    });
    expect(out.lastMessageType).toBe("image");
    expect(out.lastMessage).toBe("사진");
    expect(out.lastMessage).not.toContain("http");
  });

  it("file → fileName semantic", () => {
    const out = canonicalRoomListPreviewFromMessageFields({
      messageType: "file",
      content: "https://cdn.example.com/doc.pdf",
      metadata: { fileName: "report.pdf" },
    });
    expect(out.lastMessageType).toBe("file");
    expect(out.lastMessage).toBe("report.pdf");
  });

  it("TEXT https image URL stays text content", () => {
    const url = "https://x.com/a.jpg";
    const out = canonicalRoomListPreviewFromMessageFields({
      messageType: "text",
      content: url,
    });
    expect(out.lastMessageType).toBe("text");
    expect(out.lastMessage).toBe(url);
  });
});

describe("getRoomPreviewText TEXT URL safety", () => {
  it("does not convert text https://…jpg into photo label", () => {
    const room = {
      id: "r1",
      roomType: "direct",
      title: "peer",
      lastMessage: "https://x.com/a.jpg",
      lastMessageType: "text",
      lastMessageAt: "2026-09-10T00:00:00.000Z",
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      memberCount: 2,
      avatarUrl: null,
      peerUserId: "u2",
      contextMeta: null,
    } as CommunityMessengerRoomSummary;
    const preview = getRoomPreviewText(room);
    expect(preview).toBe("https://x.com/a.jpg");
    expect(preview).not.toBe("사진");
  });
});
