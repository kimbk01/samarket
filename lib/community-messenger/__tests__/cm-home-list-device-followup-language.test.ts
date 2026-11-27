import { afterEach, describe, expect, it } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import {
  encodeCallStubRoomTip,
  formatCallStubRoomTipForViewer,
} from "@/lib/community-messenger/call-stub-room-tip";
import { messengerRoomDefaultTitleKey } from "@/lib/community-messenger/room/messenger-room-last-message-placeholder";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** 실기 2026-11-27 16:44 PHT (운영 b1a70f8 · Samsung) 메신저 홈 목록 언어 결함 후속 */
const HANGUL = /[가-힣]/;

function room(lastMessage: string, lastMessageType: CommunityMessengerRoomSummary["lastMessageType"]) {
  return { lastMessage, lastMessageType } as CommunityMessengerRoomSummary;
}

describe("결함 1 — 옛 통화 시간 영어 글자(「26m 55s」)", () => {
  afterEach(() => setRuntimeAppLanguage("en"));

  it("한국어 화면: 옛 저장 「영상 통화 · 26m 55s」 → 「영상 통화 · 26분 55초」", () => {
    expect(formatCallStubRoomTipForViewer("영상 통화 · 26m 55s", null, "ko")).toBe("영상 통화 · 26분 55초");
    expect(formatCallStubRoomTipForViewer("음성 통화 · 12s", null, "ko")).toBe("음성 통화 · 12초");
    setRuntimeAppLanguage("ko");
    const shown = getRoomPreviewText(room("영상 통화 · 26m 55s", "call_stub"));
    expect(shown).toBe("영상 통화 · 26분 55초");
    expect(shown).not.toMatch(/\d+m \d+s/);
  });

  it("영어 화면: 같은 옛 저장 → 한글 없음", () => {
    setRuntimeAppLanguage("en");
    const shown = getRoomPreviewText(room("영상 통화 · 26m 55s", "call_stub"));
    expect(shown).not.toMatch(HANGUL);
    expect(shown).toContain("26m 55s");
  });

  it("토큰 공유 라벨이 옛 영어 시간이면(보는 사람 모름) 한국어 화면에서 다시 그린다", () => {
    const token = encodeCallStubRoomTip({
      callKind: "video",
      status: "ended",
      resolvedEvent: "ended",
      initiatorUserId: "u-a",
      recipientUserId: "u-b",
      durationSeconds: 1615,
      sharedLabel: "영상 통화 · 26m 55s",
    });
    expect(formatCallStubRoomTipForViewer(token, null, "ko")).toBe("영상 통화 · 26분 55초");
  });

  it("한국어 화면: 이미 한국어인 옛 문장은 그대로(무변경)", () => {
    expect(formatCallStubRoomTipForViewer("영상 통화 · 26분 55초", null, "ko")).toBe("영상 통화 · 26분 55초");
    expect(formatCallStubRoomTipForViewer("음성 통화 · 종료", null, "ko")).toBe("음성 통화 · 종료");
  });
});

describe("결함 2 — 빈 방 안내·기본 방 제목", () => {
  afterEach(() => setRuntimeAppLanguage("en"));

  it("새 방(종류 system) 안내 「메시지를 보내 보세요.」 → 영어 화면 영어", () => {
    setRuntimeAppLanguage("en");
    const direct = getRoomPreviewText(room("메시지를 보내 보세요.", "system"));
    expect(direct).toBe("Send a message to start chatting.");
    expect(getRoomPreviewText(room("그룹 대화를 시작해 보세요.", "system"))).toBe("Start a group conversation.");
  });

  it("한국어 화면: 영어로 저장된 안내 → 한국어(영어 문장 없음)", () => {
    setRuntimeAppLanguage("ko");
    expect(getRoomPreviewText(room("Send a message to start chatting.", "system"))).toBe("메시지를 보내 보세요.");
    expect(getRoomPreviewText(room("Start a group conversation.", "text"))).toBe("그룹 대화를 시작해 보세요.");
  });

  it("기본 방 제목만 키로, 사람이 쓴 제목은 null", () => {
    expect(messengerRoomDefaultTitleKey("새 대화")).toBe("cm_ui_new_conversation");
    expect(messengerRoomDefaultTitleKey("New conversation")).toBe("cm_ui_new_conversation");
    expect(messengerRoomDefaultTitleKey("cm_ui_new_conversation")).toBe("cm_ui_new_conversation");
    expect(messengerRoomDefaultTitleKey("새 대화방 모임")).toBeNull();
    expect(messengerRoomDefaultTitleKey("김철수")).toBeNull();
    expect(messengerRoomDefaultTitleKey("")).toBeNull();
  });
});
