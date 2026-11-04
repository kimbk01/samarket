import { describe, expect, it, vi } from "vitest";
import {
  GIFT_HISTORY_MAX_LIMIT,
  GIFT_HISTORY_PAGE_SIZE,
  parseGiftHistoryKind,
  parseGiftHistoryPageParams,
  parseGiftHistoryUrlState,
  loadGiftWalletPeriodSummary,
  writeGiftHistoryUrlState,
} from "@/lib/gift-certificate/gift-wallet-history";

const sp = (q: string) => new URLSearchParams(q);

describe("C-4 기간 합계 = DB 집계 1회 (P-9 · member_gift_wallet_period_sums)", () => {
  it("구매=결제 금액 · 사용=적용 금액·소멸 · 선물=액면가 — DB 값을 그대로 칸으로", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        purchased: { count: 2, amount: 1350 },
        used: { count: 2, amount: 1300, forfeited: 200 },
        received: { count: 1, amount: 500 },
        sent: { count: 3, amount: 1250 },
      },
      error: null,
    }));
    const r = await loadGiftWalletPeriodSummary({ rpc } as never, { userId: "u1", fromIso: "a", toIso: "b" });
    expect(rpc).toHaveBeenCalledWith("member_gift_wallet_period_sums", { p_user_id: "u1", p_from: "a", p_to: "b" });
    expect(r).toEqual({
      ok: true,
      summary: {
        purchased: { count: 2, amount: 1350 },
        used: { count: 2, amount: 1300 },
        forfeited: 200,
        received: { count: 1, amount: 500 },
        sent: { count: 3, amount: 1250 },
      },
    });
  });

  it("조회 실패는 오류(0 으로 숨기지 않음)", async () => {
    const r = await loadGiftWalletPeriodSummary({ rpc: async () => ({ data: null, error: { message: "x" } }) } as never, {
      userId: "u1",
      fromIso: null,
      toIso: null,
    });
    expect(r.ok).toBe(false);
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
