import { afterEach, describe, expect, it } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import {
  messengerRoomTitleDisplayKey,
  resolveMessengerRoomDisplayTitle,
} from "@/lib/community-messenger/room/messenger-room-display-title";
import { resolveRoomContextHeadline } from "@/lib/community-messenger/delivery-room-headline";
import { presentCommunityMessengerRoomContextListText } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/**
 * 실기 2026-11-27 16:44 PHT (운영 b1a70f8 · Samsung) 메신저 홈 목록 언어 결함 후속 — 통화 아닌 부분(#662 → PR-A).
 * 통화 시간 「26m 55s」(결함 1)는 PR-C.
 */
const HANGUL = /[가-힣]/;

const tFor = (lang: "ko" | "en") => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

function room(lastMessage: string, lastMessageType: CommunityMessengerRoomSummary["lastMessageType"]) {
  return { lastMessage, lastMessageType } as CommunityMessengerRoomSummary;
}

describe("결함 2 — 빈 방 안내", () => {
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
});

describe("E4③·M2 — 서버 대체 방 제목은 보는 사람 언어, 사람이 정한 제목은 그대로", () => {
  it("1:1 기본 제목 「새 대화」 → 영어 화면 영어", () => {
    expect(resolveMessengerRoomDisplayTitle({ title: "새 대화", roomType: "direct" }, tFor("en"))).toBe(
      "New conversation"
    );
    expect(resolveMessengerRoomDisplayTitle({ title: "New conversation", roomType: "direct" }, tFor("ko"))).toBe(
      "새 대화"
    );
  });

  it("그룹 방에 사람이 붙인 「새 대화」는 그대로 (1:1 만 대응)", () => {
    expect(messengerRoomTitleDisplayKey({ title: "새 대화", roomType: "private_group" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: "새 대화", roomType: "open_group" })).toBeNull();
    expect(resolveMessengerRoomDisplayTitle({ title: "새 대화", roomType: "private_group" }, tFor("en"))).toBe("새 대화");
  });

  it("1:1 대체 이름 「회원 abc123」 → 영어 화면 「Member abc123」, 닉네임 「회원」·「회원님」은 그대로", () => {
    expect(resolveMessengerRoomDisplayTitle({ title: "회원 abc123", roomType: "direct" }, tFor("en"))).toBe(
      "Member abc123"
    );
    expect(messengerRoomTitleDisplayKey({ title: "회원", roomType: "direct" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: "회원 김철수", roomType: "direct" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: "회원 abc123", roomType: "private_group" })).toBeNull();
  });

  it("비공개 그룹 기본 제목 「그룹 3명」 → 저장 인원 수 그대로 영어 틀, 정확한 틀이 아니면 그대로", () => {
    const en = resolveMessengerRoomDisplayTitle({ title: "그룹 3명", roomType: "private_group" }, tFor("en"));
    expect(en).toBe(translate("en", "cm_svc_group_members", { count: 3 }));
    expect(en).not.toMatch(HANGUL);
    expect(messengerRoomTitleDisplayKey({ title: "그룹 3명 모임", roomType: "private_group" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: "우리 그룹 3명", roomType: "private_group" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: "그룹 3명", roomType: "direct" })).toBeNull();
  });

  it("비공개 그룹 기본 제목 「A, B 외 N명」 → 이름은 그대로, 틀만 보는 사람 언어", () => {
    const ko = translate("ko", "cm_svc_group_and_more", { labels: "철수, 영희", extra: 2 });
    const en = translate("en", "cm_svc_group_and_more", { labels: "철수, 영희", extra: 2 });
    expect(resolveMessengerRoomDisplayTitle({ title: ko, roomType: "private_group" }, tFor("en"))).toBe(en);
    expect(resolveMessengerRoomDisplayTitle({ title: en, roomType: "private_group" }, tFor("ko"))).toBe(ko);
    // 정확한 틀이 아니거나 다른 방 종류면 원문
    expect(messengerRoomTitleDisplayKey({ title: `${ko} 모임`, roomType: "private_group" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: ko, roomType: "direct" })).toBeNull();
    expect(messengerRoomTitleDisplayKey({ title: ko, roomType: "open_group" })).toBeNull();
  });

  it("공개 그룹 기본 제목 「공개 그룹방」 → 영어, 비공개 그룹에서는 그대로", () => {
    expect(resolveMessengerRoomDisplayTitle({ title: "공개 그룹방", roomType: "open_group" }, tFor("en"))).toBe(
      translate("en", "cm_svc_open_group_room")
    );
    expect(messengerRoomTitleDisplayKey({ title: "공개 그룹방", roomType: "private_group" })).toBeNull();
  });

  it("사람 이름·빈 제목은 그대로", () => {
    expect(resolveMessengerRoomDisplayTitle({ title: "김철수", roomType: "direct" }, tFor("en"))).toBe("김철수");
    expect(resolveMessengerRoomDisplayTitle({ title: "", roomType: "direct" }, tFor("en"))).toBe("");
  });
});

describe("M2 — 배달 방 머리 문구는 매장명·주문번호로 보는 사람 언어", () => {
  it("서버가 headline 을 안 만든 새 행 → 키로 그림", () => {
    const meta = { v: 1 as const, kind: "delivery" as const, storeDisplayName: "Jollibee", orderNo: "A-12" };
    expect(resolveRoomContextHeadline(meta, (key) => translate("en", key))).toBe("Jollibee · Order A-12");
    expect(resolveRoomContextHeadline(meta, (key) => translate("ko", key))).toBe("Jollibee · 주문 A-12");
  });

  it("옛 행: 같은 매장명·주문번호의 한국어 기본 틀이면 영어 화면 영어", () => {
    const meta = {
      v: 1 as const,
      kind: "delivery" as const,
      storeDisplayName: "Jollibee",
      orderNo: "A-12",
      headline: "Jollibee · 주문 A-12",
    };
    expect(resolveRoomContextHeadline(meta, (key) => translate("en", key))).toBe("Jollibee · Order A-12");
    expect(presentCommunityMessengerRoomContextListText({ ...meta, priceLabel: "₱500" }, (key) => translate("en", key))).toBe(
      "Jollibee · Order A-12 · ₱500"
    );
  });

  it("틀과 다른 저장 headline(매장명만 등)·거래 방 headline 은 그대로", () => {
    expect(
      resolveRoomContextHeadline(
        { v: 1, kind: "delivery", storeDisplayName: "Jollibee", orderNo: "A-12", headline: "Jollibee" },
        (key) => translate("en", key)
      )
    ).toBe("Jollibee");
    expect(resolveRoomContextHeadline({ v: 1, kind: "trade", headline: "자전거" }, (key) => translate("en", key))).toBe(
      "자전거"
    );
  });

  it("매장명 없음 → 보는 사람 언어 대체 매장명", () => {
    expect(resolveRoomContextHeadline({ v: 1, kind: "delivery", orderNo: "7" }, (key) => translate("en", key))).toBe(
      "Store · Order 7"
    );
  });
});
