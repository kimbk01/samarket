/**
 * 언어 재감사 교차 수정(묶음 A) — 저장 토큰·옛 한국어 고정값 → 보는 사람 언어.
 * 확인: 영어 결과에 한글 0, 한국어 결과에 영어 문장 0.
 */
import { afterEach, describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import { presentCommunityMessengerRoomContextListText } from "@/lib/community-messenger/room-context-meta";
import { tradeContextMetaRoleLabel } from "@/lib/community-messenger/product-chat-messenger-meta";
import {
  resolveAdminHiddenMessagePlaceholder,
  resolveDeletedMessagePlaceholder,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import { STORE_ORDER_MATCH_ACK_MESSAGE } from "@/lib/chats/store-order-match-ack-text";
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import { formatStoreOrderSummaryText } from "@/lib/stores/format-store-order-chat-summary";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const HANGUL = /[가-힣]/;
const EN_SENTENCE = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/;
const tFor = (lang: "ko" | "en") => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

function room(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return { lastMessage: "", lastMessageType: "text", ...partial } as CommunityMessengerRoomSummary;
}

afterEach(() => setRuntimeAppLanguage("ko"));

describe("홈 목록 미리보기 — 삭제·숨김 토큰·빈 system·주문 응답", () => {
  it("삭제·숨김 저장 토큰은 보는 사람 언어", () => {
    for (const token of [resolveDeletedMessagePlaceholder(), resolveAdminHiddenMessagePlaceholder()]) {
      setRuntimeAppLanguage("en");
      expect(getRoomPreviewText(room({ lastMessage: token }))).not.toMatch(HANGUL);
      setRuntimeAppLanguage("ko");
      expect(getRoomPreviewText(room({ lastMessage: token }))).not.toMatch(EN_SENTENCE);
    }
  });

  it("종류 메타가 있는 빈 system 은 「시스템 메시지」 키, 메타 없는 빈 system(방 생성 기본값)은 빈 방 안내", () => {
    setRuntimeAppLanguage("en");
    const withMeta = room({
      lastMessageType: "system",
      lastMessageMeta: { kind: "unknown" } as unknown as CommunityMessengerRoomSummary["lastMessageMeta"],
    });
    expect(getRoomPreviewText(withMeta)).toBe(translate("en", "cm_home_sys_message"));
    expect(getRoomPreviewText(room({ lastMessageType: "system" }))).toBe(
      translate("en", "cm_home_preview_no_messages")
    );
  });

  it("주문 「일치합니다」 자동 응답은 보는 사람 언어", () => {
    setRuntimeAppLanguage("en");
    expect(getRoomPreviewText(room({ lastMessage: STORE_ORDER_MATCH_ACK_MESSAGE }))).toBe(
      translate("en", "store_order_match_ack")
    );
  });

  it("회원이 쓴 글은 그대로", () => {
    setRuntimeAppLanguage("en");
    expect(getRoomPreviewText(room({ lastMessage: "안녕하세요" }))).toBe("안녕하세요");
  });
});

describe("거래 역할 줄 — 저장 토큰 → 키", () => {
  it("판매자·구매자 토큰: en 한글 0", () => {
    for (const role of ["seller", "buyer"] as const) {
      const meta = { v: 1 as const, kind: "trade" as const, roleLabel: tradeContextMetaRoleLabel(role) };
      expect(presentCommunityMessengerRoomContextListText(meta, tFor("en"))).not.toMatch(HANGUL);
      expect(presentCommunityMessengerRoomContextListText(meta, tFor("ko"))).toMatch(HANGUL);
    }
  });
});

describe("주문 요약 판별 — 영어 요약도 같은 요약", () => {
  it("ko·en 요약 본문 모두 요약으로 판별", () => {
    const order = { order_no: "A-1", store_name: "Cafe", order_status: "pending" } as Parameters<
      typeof formatStoreOrderSummaryText
    >[0];
    for (const lang of ["ko", "en"] as const) {
      expect(isStoreOrderSummarySystemContent(formatStoreOrderSummaryText(order, [], lang)), lang).toBe(true);
    }
    expect(isStoreOrderSummarySystemContent("Order summary please")).toBe(false);
  });
});
