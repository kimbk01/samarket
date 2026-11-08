import { describe, expect, it } from "vitest";
import { encodeCallStubRoomTip } from "@/lib/community-messenger/call-stub-room-tip";
import { buildGeneralDirectRowModel } from "@/lib/messenger/general-direct/row-model";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

describe("domain-shell row models — call stub room tip token never rendered raw", () => {
  it("general_direct row shows shared label for token tip", () => {
    /** 목록은 화면 언어(언어 SSOT 6번) — 이 기대값은 한국어 화면 */
    setRuntimeAppLanguage("ko");
    const token = encodeCallStubRoomTip({
      callKind: "voice",
      status: "cancelled",
      resolvedEvent: "cancelled_by_caller",
      initiatorUserId: "a",
      recipientUserId: "b",
      durationSeconds: 0,
      sharedLabel: "음성 통화 · 취소됨",
    });
    const row = buildGeneralDirectRowModel({
      roomId: "r",
      domainIdentityKey: "general_direct:a:b",
      lastMessage: token,
      lastMessageAt: "2026-10-15T00:00:00Z",
      unreadCount: 0,
    } as never);
    expect(row.previewText).toBe("음성 통화 · 취소됨");
  });
});
