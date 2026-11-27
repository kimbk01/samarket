/**
 * 언어 재감사 2026-11-27 — 메신저 도메인 고정 문구 → 키 (`docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md`).
 * 확인: 영어 결과에 한글 0, 한국어 결과에 영어 문장 0.
 */
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  communityMessengerFriendRequestFailureMessage,
  formatFriendRejectCooldownMessage,
  FRIEND_REQUEST_FAILURE_MESSAGE_KEYS,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import {
  formatReplyQuoteForMessage,
  formatReplyQuoteKakaoHeader,
  resolveAdminHiddenMessagePlaceholder,
  resolveDeletedMessagePlaceholder,
  resolveStoredMessagePlaceholderKey,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import {
  tradeContextMetaRoleLabel,
  tradeContextMetaRoleLabelKey,
  buildMessengerContextMetaFromProductChatSnapshot,
} from "@/lib/community-messenger/product-chat-messenger-meta";
import { messengerTradeViewerRoleFromContextMeta } from "@/lib/community-messenger/messenger-trade-viewer-role";
import {
  canonicalRoomListPreviewFromMessageFields,
  ROOM_LIST_PREVIEW_CALL_TOKEN,
} from "@/lib/community-messenger/room-list-semantic-preview";

const HANGUL = /[가-힣]/;
/** 한국어 결과에 섞이면 안 되는 영어 문장(두 단어 이상 연속) */
const EN_SENTENCE = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/;
const tFor = (lang: "ko" | "en") => (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

describe("친구 요청 실패 문구", () => {
  it("코드 표 전부 + 기본 문구: en 한글 0 · ko 영어 문장 0", () => {
    for (const code of [...Object.keys(FRIEND_REQUEST_FAILURE_MESSAGE_KEYS), "unknown_code"]) {
      const en = communityMessengerFriendRequestFailureMessage({ ok: false, error: code }, tFor("en"));
      const ko = communityMessengerFriendRequestFailureMessage({ ok: false, error: code }, tFor("ko"));
      expect(en, code).not.toMatch(HANGUL);
      expect(ko, code).toMatch(HANGUL);
      expect(ko, code).not.toMatch(EN_SENTENCE);
    }
  });

  it("거절 쿨다운 — 일·시간·분 모두 두 언어", () => {
    for (const ms of [5 * 60_000, 2 * 60 * 60_000, 2 * 60 * 60_000 + 15 * 60_000, 3 * 24 * 60 * 60_000]) {
      const en = formatFriendRejectCooldownMessage(ms, tFor("en"));
      const ko = formatFriendRejectCooldownMessage(ms, tFor("ko"));
      expect(en).not.toMatch(HANGUL);
      expect(ko).not.toMatch(EN_SENTENCE);
    }
    expect(formatFriendRejectCooldownMessage(2 * 60 * 60_000 + 15 * 60_000, tFor("ko"))).toContain("2시간 15분");
    expect(formatFriendRejectCooldownMessage(3 * 24 * 60 * 60_000, tFor("en"))).toContain("3 days");
  });
});

describe("답장 인용·삭제/숨김 대체 문구", () => {
  it("답장 머리 줄", () => {
    expect(formatReplyQuoteKakaoHeader("BK Kim", tFor("en"))).toBe("Reply to BK Kim");
    expect(formatReplyQuoteKakaoHeader("BK Kim", tFor("ko"))).toBe("BK Kim에게 답장");
    expect(formatReplyQuoteKakaoHeader(" ", tFor("en"))).not.toMatch(HANGUL);
  });

  it("저장 토큰은 그대로(목록·병합 계약), 화면은 키로", () => {
    expect(resolveStoredMessagePlaceholderKey(resolveDeletedMessagePlaceholder())).toBe("cm_ui_message_deleted_placeholder");
    expect(resolveStoredMessagePlaceholderKey(resolveAdminHiddenMessagePlaceholder())).toBe(
      "cm_ui_message_admin_hidden_placeholder"
    );
    expect(resolveStoredMessagePlaceholderKey("안녕하세요")).toBeNull();
    const quote = formatReplyQuoteForMessage(
      { replyToMessageId: "m1", replyPreviewText: resolveDeletedMessagePlaceholder(), replySenderLabelSnapshot: "" },
      tFor("en")
    );
    expect(quote?.previewText).not.toMatch(HANGUL);
    expect(quote?.senderLabel).not.toMatch(HANGUL);
  });
});

describe("거래방 역할·제목", () => {
  it("역할 저장 토큰은 판별 계약 그대로, 화면 키로 두 언어", () => {
    for (const role of ["seller", "buyer"] as const) {
      const token = tradeContextMetaRoleLabel(role);
      expect(messengerTradeViewerRoleFromContextMeta({ v: 1, kind: "trade", roleLabel: token })).toBe(role);
      const key = tradeContextMetaRoleLabelKey(token);
      expect(key).not.toBeNull();
      expect(translate("en", key!)).not.toMatch(HANGUL);
    }
  });

  it("제목 없는 거래방은 한 언어 고정 「거래」를 저장하지 않는다", () => {
    const meta = buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: "pc1",
      productTitle: "  ",
      price: null,
      role: "buyer",
    });
    expect(meta.headline).toBeUndefined();
  });
});

describe("방 목록 미리보기 저장값", () => {
  it("빈 시스템·글은 화면 문장을 넣지 않는다(통화 토큰은 통화 변경 규정으로 원래 동작 유지)", () => {
    /** 통화 줄은 #655 에서 원래대로 되돌림 — 빈 통화 토큰 = `ROOM_LIST_PREVIEW_CALL_TOKEN`(렌더러가 viewer 언어로 해석) */
    expect(canonicalRoomListPreviewFromMessageFields({ messageType: "call_stub", content: "" }).lastMessage).toBe(
      ROOM_LIST_PREVIEW_CALL_TOKEN
    );
    expect(canonicalRoomListPreviewFromMessageFields({ messageType: "system", content: "" }).lastMessage).toBe("");
    expect(canonicalRoomListPreviewFromMessageFields({ messageType: "text", content: "" }).lastMessage).toBe("");
    expect(canonicalRoomListPreviewFromMessageFields({ messageType: "text", content: "hi" }).lastMessage).toBe("hi");
  });
});
