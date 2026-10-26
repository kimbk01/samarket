import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  consumeHomeListReturnReconcileNeeded,
  markHomeListReturnReconcileNeeded,
} from "@/lib/community-messenger/home/home-list-return-reconcile-flag";
import { finalizeDeletedForEveryoneMessage } from "@/lib/community-messenger/room/messenger-message-merge-authority";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

describe("N-3 삭제 뒤 목록 미리보기", () => {
  it("표시는 복귀 1회에만 적용(읽고 지움)", () => {
    consumeHomeListReturnReconcileNeeded();
    expect(consumeHomeListReturnReconcileNeeded()).toBe(false);
    markHomeListReturnReconcileNeeded();
    expect(consumeHomeListReturnReconcileNeeded()).toBe(true);
    expect(consumeHomeListReturnReconcileNeeded()).toBe(false);
  });

  it("본문이 남은 행에 삭제를 처음 반영하면 표시 · 이미 삭제 확정된 행 재병합은 표시 안 함", () => {
    consumeHomeListReturnReconcileNeeded();
    const live = {
      id: "m1",
      content: "S1reply0214",
      deletedForEveryoneAt: "2026-10-26T07:00:00.000Z",
    } as unknown as CommunityMessengerMessage;
    const finalized = finalizeDeletedForEveryoneMessage(live);
    expect(consumeHomeListReturnReconcileNeeded()).toBe(true);
    finalizeDeletedForEveryoneMessage(finalized);
    expect(consumeHomeListReturnReconcileNeeded()).toBe(false);
    finalizeDeletedForEveryoneMessage({ id: "m2", content: "hi" } as unknown as CommunityMessengerMessage);
    expect(consumeHomeListReturnReconcileNeeded()).toBe(false);
  });

  it("목록 복귀 정합은 삭제를 본 경우 10초 안이어도 1회 · 서버 삭제는 참가자 목록·배지 캐시 무효화", () => {
    const home = readFileSync("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts", "utf8");
    expect(home).toContain("const deletionSeenInRoom = consumeHomeListReturnReconcileNeeded();");
    const bump = readFileSync("lib/community-messenger/server/publish-messenger-room-bump.ts", "utf8");
    expect(bump).toContain('args.messageForBump?.messageType === "call_stub" || args.invalidateParticipantLists === true');
    const service = readFileSync("lib/community-messenger/service.ts", "utf8");
    const del = service.slice(service.indexOf("[messenger-delete] bump_publish_failed") - 600);
    expect(del).toContain("invalidateParticipantLists: true");
  });
});

describe("N-3 캐시 그림 미리보기 교체", () => {
  it("삭제된 메시지가 그 방 마지막이면 원문 대신 서버와 같은 미리보기 · 다른 방·다른 시각은 그대로", async () => {
    const { applyDeletedTipsToRooms, consumeDeletedRoomListTips } = await import(
      "@/lib/community-messenger/home/home-list-return-reconcile-flag"
    );
    const { canonicalRoomListPreviewFromMessageFields } = await import("@/lib/community-messenger/room-list-semantic-preview");
    consumeDeletedRoomListTips();
    markHomeListReturnReconcileNeeded({ roomId: "r1", createdAt: "2026-10-26T07:38:10.000Z" });
    const tips = consumeDeletedRoomListTips();
    const rooms = [
      { id: "r1", lastMessage: "N3b1538", lastMessageAt: "2026-10-26T07:38:10.000Z", lastMessageType: "text" },
      { id: "r2", lastMessage: "keep", lastMessageAt: "2026-10-26T07:38:10.000Z", lastMessageType: "text" },
    ];
    const out = applyDeletedTipsToRooms(rooms, tips);
    expect(out[0].lastMessage).toBe(canonicalRoomListPreviewFromMessageFields({ messageType: "text", content: "" }).lastMessage);
    expect(out[0].lastMessage).not.toBe("N3b1538");
    expect(out[1]).toBe(rooms[1]);
    const newer = [{ id: "r1", lastMessage: "newer", lastMessageAt: "2026-10-26T07:39:00.000Z" }];
    expect(applyDeletedTipsToRooms(newer, tips)).toBe(newer);
    expect(consumeDeletedRoomListTips().size).toBe(0);
  });
});
