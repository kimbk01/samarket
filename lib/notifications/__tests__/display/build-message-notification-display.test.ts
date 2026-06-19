import { describe, expect, it } from "vitest";
import {
  buildMessageNotificationDisplay,
  resolveMessageNotificationPreviewKind,
} from "@/lib/notifications/display/build-message-notification-display";

describe("buildMessageNotificationDisplay", () => {
  it("direct text message uses sender title and preview body", () => {
    const display = buildMessageNotificationDisplay({
      language: "ko",
      chatPreviewEnabled: true,
      roomKind: "direct",
      messageType: "text",
      textContent: "안녕하세요",
      sender: { displayName: "aaaa", avatarUrl: "https://cdn.example/a.png" },
      room: { name: null, contextLabel: null },
      roomId: "room-1",
    });
    expect(display.title).toBe("aaaa");
    expect(display.body).toBe("안녕하세요");
    expect(display.previewKind).toBe("text");
    expect(display.senderAvatarUrl).toBe("https://cdn.example/a.png");
  });

  it("image message uses photo preview body", () => {
    const display = buildMessageNotificationDisplay({
      language: "ko",
      chatPreviewEnabled: true,
      roomKind: "direct",
      messageType: "image",
      sender: { displayName: "aaaa", avatarUrl: null },
      room: { name: null, contextLabel: null },
      roomId: "room-1",
    });
    expect(display.body).toBe("사진을 보냈습니다");
    expect(display.previewKind).toBe("image");
  });

  it("privacy off uses generic new message body", () => {
    const display = buildMessageNotificationDisplay({
      language: "ko",
      chatPreviewEnabled: false,
      roomKind: "direct",
      messageType: "text",
      textContent: "secret",
      sender: { displayName: "aaaa", avatarUrl: null },
      room: { name: null, contextLabel: null },
      roomId: "room-1",
    });
    expect(display.body).toBe("새 메시지");
    expect(display.privacyRedacted).toBe(true);
    expect(display.title).toBe("aaaa");
  });

  it("group message uses room title and sender prefix", () => {
    const display = buildMessageNotificationDisplay({
      language: "ko",
      chatPreviewEnabled: true,
      roomKind: "group",
      messageType: "text",
      textContent: "모임 공지",
      sender: { displayName: "bbbb", avatarUrl: null },
      room: { name: "친구들", contextLabel: null },
      roomId: "room-g",
    });
    expect(display.title).toBe("친구들");
    expect(display.body).toBe("bbbb: 모임 공지");
  });

  it("trade message includes context label in title", () => {
    const display = buildMessageNotificationDisplay({
      language: "ko",
      chatPreviewEnabled: true,
      roomKind: "trade",
      messageType: "text",
      textContent: "가격 문의",
      sender: { displayName: "cccc", avatarUrl: null },
      room: { name: null, contextLabel: "아이폰 15" },
      roomId: "room-t",
    });
    expect(display.title).toBe("아이폰 15");
    expect(display.body).toBe("cccc: 가격 문의");
    expect(display.contextLabel).toBe("아이폰 15");
  });
});

describe("resolveMessageNotificationPreviewKind", () => {
  it("detects location share from text prefix", () => {
    expect(resolveMessageNotificationPreviewKind("text", "📍 위치 공유\nhttps://maps")).toBe("location");
  });
});
