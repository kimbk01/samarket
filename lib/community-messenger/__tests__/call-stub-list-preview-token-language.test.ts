import { afterEach, describe, expect, it } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import { ROOM_LIST_PREVIEW_CALL_TOKEN } from "@/lib/community-messenger/room-list-semantic-preview";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** 저장 호환 토큰 「통화」(call_stub 상세 없음) → 보는 사람 언어 (docs/audit/i18n-call-copy-plan-2026-11-27.md §1 M) */
function room(lastMessage: string): CommunityMessengerRoomSummary {
  return { lastMessage, lastMessageType: "call_stub" } as CommunityMessengerRoomSummary;
}

describe("call_stub list preview token", () => {
  afterEach(() => setRuntimeAppLanguage("en"));

  it("저장 토큰 값은 예전과 같다(호환)", () => {
    expect(ROOM_LIST_PREVIEW_CALL_TOKEN).toBe("통화");
  });

  it("영어 화면 — 「Call」, 한국어 화면 — 「통화」", () => {
    setRuntimeAppLanguage("en");
    expect(getRoomPreviewText(room(ROOM_LIST_PREVIEW_CALL_TOKEN))).toBe("Call");
    setRuntimeAppLanguage("ko");
    expect(getRoomPreviewText(room(ROOM_LIST_PREVIEW_CALL_TOKEN))).toBe("통화");
  });
});
