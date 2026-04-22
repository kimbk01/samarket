import { describe, expect, it } from "vitest";
import {
  buildCommunityMessengerInternalShareClipboard,
  parseInternalShareCardFromClipboard,
} from "@/lib/community-messenger/message-actions/message-internal-share-card";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const item = (): Pick<CommunityMessengerMessage, "id" | "messageType" | "createdAt"> => ({
  id: "mid-1",
  messageType: "text",
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("message-internal-share-card", () => {
  it("roundtrips parse after build", () => {
    const clip = buildCommunityMessengerInternalShareClipboard({
      roomTitle: "테스트 방",
      sourceRoomId: "room-ledger-1",
      item: item(),
      previewText: "hello world",
    });
    const parsed = parseInternalShareCardFromClipboard(clip);
    expect(parsed).not.toBeNull();
    expect(parsed?.v).toBe(1);
    expect(parsed?.messageId).toBe("mid-1");
    expect(parsed?.sourceRoomId).toBe("room-ledger-1");
    expect(parsed?.previewText).toBe("hello world");
  });
});
