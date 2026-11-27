/**
 * 언어 재감사 2026-11-27 — 거래·주문 도메인 목록 미리보기 고정 문구 → 키. 영어 결과에 한글 0.
 */
import { describe, expect, it } from "vitest";
import { resolveTradePreview } from "@/lib/messenger/trade/preview";
import { normalizeTradeListPreviewLine, resolveTradeItemStatus } from "@/lib/messenger/trade/item-status";
import { resolveStoreOrderPreview } from "@/lib/messenger/store-order/preview";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

const HANGUL = /[가-힣]/;

describe("거래·주문 도메인 목록 미리보기", () => {
  it("거래 미리보기 — 보는 사람 언어", () => {
    for (const messageType of ["image", "voice", "file"]) {
      expect(resolveTradePreview({ content: "", messageType }, "en").text).not.toMatch(HANGUL);
      expect(resolveTradePreview({ content: "", messageType }, "ko").text).toMatch(HANGUL);
    }
    expect(resolveTradePreview(null, "en").text).not.toMatch(HANGUL);
    expect(normalizeTradeListPreviewLine({ previewText: "", isSystem: false, statusBadgeLabel: null, lang: "en" }).text).not.toMatch(
      HANGUL
    );
    for (const postStatus of ["deleted", "hidden", "sold"]) {
      expect(resolveTradeItemStatus({ postStatus }, "en").statusBadgeLabel).not.toMatch(HANGUL);
      expect(resolveTradeItemStatus({ postStatus }, "ko").statusBadgeLabel).toMatch(HANGUL);
    }
  });

  it("주문 미리보기 — 보는 사람 언어", () => {
    for (const messageType of ["image", "voice", "file"]) {
      const en = resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "", messageType },
        lang: "en",
      });
      expect(en.text).not.toMatch(HANGUL);
    }
    const empty = resolveStoreOrderPreview({ chatDomain: STORE_ORDER_DOMAIN, latestChatMessage: null, lang: "ko" });
    expect(empty.text).toMatch(HANGUL);
  });
});
