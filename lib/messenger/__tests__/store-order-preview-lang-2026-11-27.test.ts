/**
 * 언어 재감사 교차 수정(묶음 A) — 주문 채팅 목록 미리보기가 보는 사람 언어를 받는지.
 * `lib/community-messenger/**` 는 `@/lib/messenger/*` import 금지(격리 검사 `phase6-bootstrap-cache.test.ts`)라
 * 이 묶음만 메신저 도메인 테스트 폴더에 둔다(옮김 — 원래 `lib/community-messenger/__tests__/messenger-cross-copy-2026-11-27.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { STORE_ORDER_MATCH_ACK_MESSAGE } from "@/lib/chats/store-order-match-ack-text";
import { resolveStoreOrderPreview } from "@/lib/messenger/store-order/preview";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

const HANGUL = /[가-힣]/;

describe("주문 채팅 목록 미리보기 — 보는 사람 언어 전달", () => {
  it("사진·매칭 응답: en 한글 0", () => {
    const photo = resolveStoreOrderPreview({
      chatDomain: STORE_ORDER_DOMAIN,
      latestChatMessage: { text: "", messageType: "image" },
      lang: "en",
    });
    expect(photo.text).not.toMatch(HANGUL);
    const ack = resolveStoreOrderPreview({
      chatDomain: STORE_ORDER_DOMAIN,
      latestChatMessage: { text: STORE_ORDER_MATCH_ACK_MESSAGE, messageType: "text" },
      lang: "en",
    });
    expect(ack.text).toBe(translate("en", "store_order_match_ack"));
  });
});
