import { describe, expect, it } from "vitest";
import {
  GIFT_HISTORY_MAX_LIMIT,
  GIFT_HISTORY_PAGE_SIZE,
  parseGiftHistoryKind,
  parseGiftHistoryPageParams,
  parseGiftHistoryUrlState,
  summarizeGiftWalletPeriod,
  writeGiftHistoryUrlState,
} from "@/lib/gift-certificate/gift-wallet-history";

const sp = (q: string) => new URLSearchParams(q);

describe("summarizeGiftWalletPeriod (C-4 기간 합계)", () => {
  it("구매=결제 금액 · 사용=적용 금액·소멸 · 선물=액면가", () => {
    const s = summarizeGiftWalletPeriod({
      purchases: [{ purchase_price: 900 }, { purchase_price: "450" }],
      redemptions: [
        { redeemed_amount: 1000, forfeited_amount: 0 },
        { redeemed_amount: 300, forfeited_amount: 200 },
      ],
      receivedTransfers: [{ instance_id: "a" }],
      sentTransfers: [{ instance_id: "b" }, { instance_id: "c" }, { instance_id: "missing" }],
      faceValueByInstanceId: new Map([
        ["a", 500],
        ["b", 1000],
        ["c", 250],
      ]),
    });
    expect(s.purchased).toEqual({ count: 2, amount: 1350 });
    expect(s.used).toEqual({ count: 2, amount: 1300 });
    expect(s.forfeited).toBe(200);
    expect(s.received).toEqual({ count: 1, amount: 500 });
    expect(s.sent).toEqual({ count: 3, amount: 1250 });
    expect(s.capped).toBe(false);
  });

  it("빈 기간은 모두 0", () => {
    const s = summarizeGiftWalletPeriod({
      purchases: [],
      redemptions: [],
      receivedTransfers: [],
      sentTransfers: [],
      faceValueByInstanceId: new Map(),
      capped: true,
    });
    expect(s).toMatchObject({
      purchased: { count: 0, amount: 0 },
      used: { count: 0, amount: 0 },
      forfeited: 0,
      received: { count: 0, amount: 0 },
      sent: { count: 0, amount: 0 },
      capped: true,
    });
  });
});

describe("상품권 내역 주소 상태 (기본 기간 = 전체)", () => {
  it("기간이 없으면 전체 · 쪽은 1부터 받아 0부터", () => {
    expect(parseGiftHistoryUrlState(sp("tab=gifts&giftTab=used"))).toEqual({ period: { period: "all" }, page: 0 });
    expect(parseGiftHistoryUrlState(sp("period=this_month&page=3"))).toEqual({ period: { period: "this_month" }, page: 2 });
    expect(parseGiftHistoryUrlState(sp("period=custom&pfrom=2026-11-01&pto=2026-02-31"))).toEqual({
      period: { period: "custom", fromDay: "2026-11-01", toDay: "" },
      page: 0,
    });
  });

  it("쓰기 — 다른 키(from·tab) 보존, 전체·1쪽은 지움, 왕복 같음", () => {
    const base = "?tab=gifts&giftTab=used&from=delivery-activity&page=4&period=today";
    expect(writeGiftHistoryUrlState(base, { period: { period: "all" }, page: 0 })).toBe(
      "tab=gifts&giftTab=used&from=delivery-activity"
    );
    const q = writeGiftHistoryUrlState(base, {
      period: { period: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" },
      page: 1,
    });
    expect(q).toBe("tab=gifts&giftTab=used&from=delivery-activity&period=custom&pfrom=2026-10-01&pto=2026-10-31&page=2");
    expect(parseGiftHistoryUrlState(sp(q))).toEqual({
      period: { period: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" },
      page: 1,
    });
  });
});

describe("상품권 내역 요청 값", () => {
  it("kind 는 used·sent 만", () => {
    expect(parseGiftHistoryKind("used")).toBe("used");
    expect(parseGiftHistoryKind("sent")).toBe("sent");
    expect(parseGiftHistoryKind("owned")).toBeNull();
    expect(parseGiftHistoryKind(null)).toBeNull();
  });
  it("offset·limit 정리", () => {
    expect(parseGiftHistoryPageParams(sp(""))).toEqual({ offset: 0, limit: GIFT_HISTORY_PAGE_SIZE });
    expect(parseGiftHistoryPageParams(sp("offset=20&limit=500"))).toEqual({ offset: 20, limit: GIFT_HISTORY_MAX_LIMIT });
    expect(parseGiftHistoryPageParams(sp("offset=-1&limit=abc"))).toEqual({ offset: 0, limit: GIFT_HISTORY_PAGE_SIZE });
  });
});
