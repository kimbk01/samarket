import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapRealtimeMessageRow } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import { resolveDeletedMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";

/** 1단계 결함 D-15 (2026-10-26): 전체삭제된 답장 말풍선에 인용이 남지 않는다 — 삭제 UPDATE 는 reply_* 를 지우지 않는다. */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const replyRow = (deleted: boolean) => ({
  id: "22222222-2222-4222-8222-222222222222",
  room_id: "11111111-1111-4111-8111-111111111111",
  sender_id: "sender",
  message_type: "text",
  content: deleted ? "" : "D13r0249",
  metadata: {},
  created_at: "2026-10-26T02:49:26Z",
  reply_to_message_id: "33333333-3333-4333-8333-333333333333",
  reply_preview_text: "S1check0209",
  reply_preview_type: "text",
  reply_sender_label_snapshot: "q테스트1",
  deleted_for_everyone_at: deleted ? "2026-10-26T02:49:45Z" : null,
});

describe("D-15 삭제된 답장 — 인용 제거", () => {
  it("실시간 매퍼: 삭제 행은 인용 필드 없음, 삭제 전 행은 인용 유지", () => {
    const deleted = mapRealtimeMessageRow(replyRow(true));
    expect(deleted?.content).toBe(resolveDeletedMessagePlaceholder());
    expect(deleted?.replyToMessageId).toBeUndefined();
    expect(deleted?.replyPreviewText).toBeUndefined();
    const live = mapRealtimeMessageRow(replyRow(false));
    expect(live?.replyToMessageId).toBe("33333333-3333-4333-8333-333333333333");
    expect(live?.replyPreviewText).toBe("S1check0209");
  });

  it("서버 매퍼 두 곳·타임라인 인용 조건이 삭제 여부를 본다 (계약)", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain(
      "const replyToMessageId = deletedForEveryoneAt ? null : trimText(message.reply_to_message_id) || null;"
    );
    expect(svc).toMatch(/const replyPieces =\s*\n\s*!isCriticalTier &&\s*\n\s*!deletedForEveryone &&/);
    const row = read("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");
    expect(row).toMatch(/const replyQuote =\s*\n\s*!deletedForEveryone &&/);
  });
});
