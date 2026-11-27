import { describe, expect, it } from "vitest";
import { contentChangeIsAppendOnly, localizeTradeAppendNoteMarker } from "@/lib/trade/trade-lifecycle-policy";
import { resolveTradeItemStatus } from "@/lib/messenger/trade/item-status";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const HANGUL = /[가-힣]/;

describe("trade append note marker — 언어 재감사 2026-11-27", () => {
  const stored = "원래 본문\n\n[추가 안내]\nMore info";

  it("영어 화면은 저장 머리글을 영어로 바꾸고 사람이 쓴 글은 그대로 둔다", () => {
    const en = localizeTradeAppendNoteMarker(stored, (k: MessageKey) => translate("en", k));
    expect(en).toBe("원래 본문\n\n[Added note]\nMore info");
    expect(en.split("\n").slice(1).join("\n")).not.toMatch(HANGUL);
  });

  it("한국어 화면은 저장 글자와 같다", () => {
    expect(localizeTradeAppendNoteMarker(stored, (k: MessageKey) => translate("ko", k))).toBe(stored);
  });

  it("머리글 없는 본문은 그대로이고 저장 비교 형식은 바뀌지 않는다", () => {
    expect(localizeTradeAppendNoteMarker("본문", (k: MessageKey) => translate("en", k))).toBe("본문");
    expect(contentChangeIsAppendOnly("원래 본문", stored)).toBe(true);
  });
});

describe("resolveTradeItemStatus — 판매 단계 배지는 보는 사람 언어", () => {
  it("영어 배지에 한글 0", () => {
    for (const s of ["inquiry", "negotiating", "reserved", "completed"]) {
      const r = resolveTradeItemStatus({ sellerListingStateRaw: s, postStatus: "active" }, "en");
      expect(r.statusBadgeLabel).not.toMatch(HANGUL);
    }
  });

  it("한국어 배지는 예전 글자와 같다", () => {
    expect(resolveTradeItemStatus({ sellerListingStateRaw: "inquiry", postStatus: "active" }, "ko").statusBadgeLabel).toBe("판매중");
    expect(resolveTradeItemStatus({ sellerListingStateRaw: "reserved", postStatus: "active" }, "ko").statusBadgeLabel).toBe("예약중");
    expect(resolveTradeItemStatus({ sellerListingStateRaw: "completed", postStatus: "active" }, "ko").statusBadgeLabel).toBe("거래완료");
  });
});
