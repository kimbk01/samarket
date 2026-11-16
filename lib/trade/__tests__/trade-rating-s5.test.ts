import { describe, expect, it } from "vitest";
import {
  canDisputeTradeRating,
  evaluateTradeRatingEligibility,
  tradeRatingWeight,
  validateTradeRatingInput,
  type TradeRatingFacts,
  type TradeRatingRow,
} from "@/lib/trade/trade-rating";
import { planTradeRatingEvents, type TradeRatingSource } from "@/lib/trust/crew-rep-trade-rating-sync";

const NOW = new Date("2026-12-10T04:00:00.000Z");
const M = 60_000;
const D = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function msgs(sender: string, n: number, startMsAgo: number, stepMs = M): { sender_id: string; created_at: string }[] {
  return Array.from({ length: n }, (_, i) => ({ sender_id: sender, created_at: ago(startMsAgo - i * stepMs) }));
}
const facts = (over: Partial<TradeRatingFacts> = {}): TradeRatingFacts => ({
  sellerId: "S",
  buyerId: "B",
  viewerId: "B",
  messages: [...msgs("S", 3, 5 * D), ...msgs("B", 3, 5 * D - 30 * M)],
  soldAt: null,
  myReviewId: null,
  sharedDevice: false,
  blocked: false,
  accountUnavailable: false,
  ...over,
});

describe("거래 평가 자격 E1~E7 (S5)", () => {
  it("양쪽 3개 이상·10분 이상·3일 경과·30일 안 → 자격", () => {
    const e = evaluateTradeRatingEligibility(facts(), NOW);
    expect(e).toMatchObject({ eligible: true, role: "buyer_to_seller", counterpartId: "S" });
    expect(e.messageCounts).toEqual({ seller: 3, buyer: 3 });
  });

  it("판매자 쪽도 평가 가능 (역할 seller_to_buyer)", () => {
    expect(evaluateTradeRatingEligibility(facts({ viewerId: "S" }), NOW)).toMatchObject({
      eligible: true,
      role: "seller_to_buyer",
      counterpartId: "B",
    });
  });

  it("거절 사유: 참여자 아님·메시지 부족·10분 미만·창 전·창 지남·이미 평가·같은 기기·차단·계정 불가", () => {
    const r = (f: Partial<TradeRatingFacts>) => evaluateTradeRatingEligibility(facts(f), NOW).reasons;
    expect(r({ viewerId: "X" })).toContain("not_participant");
    expect(r({ messages: [...msgs("S", 3, 5 * D), ...msgs("B", 2, 5 * D - 30 * M)] })).toContain("not_enough_messages");
    expect(r({ messages: [...msgs("S", 3, 5 * D, 10_000), ...msgs("B", 3, 5 * D - 60_000, 10_000)] })).toContain(
      "conversation_too_short"
    );
    expect(r({ messages: [...msgs("S", 3, 1 * D), ...msgs("B", 3, 1 * D - 30 * M)] })).toContain("window_not_open");
    expect(r({ messages: [...msgs("S", 3, 40 * D), ...msgs("B", 3, 40 * D - 30 * M)] })).toContain("window_closed");
    expect(r({ myReviewId: "x" })).toContain("already_rated");
    expect(r({ sharedDevice: true })).toContain("shared_device");
    expect(r({ blocked: true })).toContain("blocked");
    expect(r({ accountUnavailable: true })).toContain("account_unavailable");
  });

  it("판매완료가 첫 메시지 3일보다 빠르면 판매완료 시점에 창이 열린다", () => {
    const f = facts({ messages: [...msgs("S", 3, 1 * D), ...msgs("B", 3, 1 * D - 30 * M)], soldAt: ago(2 * 60 * M) });
    expect(evaluateTradeRatingEligibility(f, NOW).eligible).toBe(true);
  });
});

describe("거래 확인 가중 w", () => {
  it("둘 다 했어요 1.0 · 한쪽만 했어요 0.7 · 했어요+대화만 둘 다 0.7 · 대화만 0.5", () => {
    expect(tradeRatingWeight("yes", "yes")).toBe(1);
    expect(tradeRatingWeight("yes", null)).toBe(0.7);
    expect(tradeRatingWeight("yes", "chat_only")).toBe(0.7);
    expect(tradeRatingWeight("chat_only", "yes")).toBe(0.7);
    expect(tradeRatingWeight("chat_only", "chat_only")).toBe(0.5);
    expect(tradeRatingWeight("chat_only", null)).toBe(0.5);
  });
});

describe("입력 검증", () => {
  it("아쉬워요는 아쉬운 태그 1개 이상, 좋아요에 아쉬운 태그 불가, 남길 말 200자", () => {
    expect(validateTradeRatingInput("buyer_to_seller", { tradeHappened: "yes", ratingType: "bad", tags: [] })).toEqual({
      ok: false,
      error: "bad_rating_tag_required",
    });
    expect(
      validateTradeRatingInput("buyer_to_seller", { tradeHappened: "yes", ratingType: "bad", tags: ["desc_mismatch"] }).ok
    ).toBe(true);
    expect(
      validateTradeRatingInput("buyer_to_seller", { tradeHappened: "yes", ratingType: "good", tags: ["desc_mismatch"] })
    ).toEqual({ ok: false, error: "invalid_tags" });
    expect(
      validateTradeRatingInput("seller_to_buyer", { tradeHappened: "yes", ratingType: "bad", tags: ["desc_mismatch"] })
    ).toEqual({ ok: false, error: "invalid_tags" });
    expect(
      validateTradeRatingInput("buyer_to_seller", { tradeHappened: "maybe", ratingType: "good", tags: [] })
    ).toEqual({ ok: false, error: "invalid_trade_happened" });
    expect(
      validateTradeRatingInput("buyer_to_seller", { tradeHappened: "yes", ratingType: "good", comment: "x".repeat(201) })
    ).toEqual({ ok: false, error: "comment_too_long" });
  });
});

const row = (over: Partial<TradeRatingRow> = {}): TradeRatingRow => ({
  id: "r1",
  room_id: "room",
  product_id: "p",
  reviewer_id: "B",
  reviewee_id: "S",
  role_type: "buyer_to_seller",
  public_review_type: "bad",
  positive_tag_keys: [],
  negative_tag_keys: ["desc_mismatch"],
  trade_happened: "yes",
  rating_status: "revealed",
  revealed_at: ago(2 * D),
  disputed_at: null,
  dispute_decision: null,
  is_hidden_by_admin: false,
  created_at: ago(3 * D),
  ...over,
});

describe("이의제기", () => {
  it("받은 사람·아쉬워요·공개 후 14일 안·1회만", () => {
    expect(canDisputeTradeRating(row(), "S", NOW)).toBe(true);
    expect(canDisputeTradeRating(row(), "B", NOW)).toBe(false);
    expect(canDisputeTradeRating(row({ public_review_type: "good" }), "S", NOW)).toBe(false);
    expect(canDisputeTradeRating(row({ revealed_at: ago(15 * D) }), "S", NOW)).toBe(false);
    expect(canDisputeTradeRating(row({ disputed_at: ago(D) }), "S", NOW)).toBe(false);
    expect(canDisputeTradeRating(row({ rating_status: "pending_reveal", revealed_at: null }), "S", NOW)).toBe(false);
  });
});

const src = (over: Partial<TradeRatingSource> = {}): TradeRatingSource => ({
  id: "r1",
  room_id: "room",
  reviewer_id: "B",
  reviewee_id: "S",
  public_review_type: "good",
  trade_happened: "yes",
  rating_status: "revealed",
  revealed_at: ago(D),
  disputed_at: null,
  dispute_decision: null,
  is_hidden_by_admin: false,
  ...over,
});

describe("거래 평가 → 원장 동기화 계획", () => {
  it("공개된 좋아요 → 받은 사람 trade_rating_good, 평가자 = counterparty, w 반영", () => {
    const [e] = planTradeRatingEvents([src(), src({ id: "r2", reviewer_id: "S", reviewee_id: "B" })], NOW);
    expect(e).toMatchObject({ member_id: "S", event_type: "trade_rating_good", counterparty_id: "B", metadata: { trade_weight: 1 } });
  });

  it("공개 전·이의 검토 중·인정(reversed)·숨김·옛 평가(trade_happened 없음) → 제외", () => {
    for (const s of [
      src({ rating_status: "pending_reveal" }),
      src({ rating_status: "disputed" }),
      src({ rating_status: "reversed" }),
      src({ is_hidden_by_admin: true }),
      src({ trade_happened: null }),
    ]) {
      expect(planTradeRatingEvents([s], NOW)).toEqual([]);
    }
  });

  it("아쉬워요는 이의 기간 14일이 지나거나 이의 기각 뒤에만", () => {
    expect(planTradeRatingEvents([src({ public_review_type: "bad" })], NOW)).toEqual([]);
    expect(planTradeRatingEvents([src({ public_review_type: "bad", revealed_at: ago(15 * D) })], NOW)).toHaveLength(1);
    expect(
      planTradeRatingEvents([src({ public_review_type: "bad", disputed_at: ago(D), dispute_decision: "rejected" })], NOW)
    ).toHaveLength(1);
  });

  it("상대 응답이 없으면 w 0.7, 대화만이면 0.5", () => {
    expect(planTradeRatingEvents([src()], NOW)[0]!.metadata.trade_weight).toBe(0.7);
    expect(planTradeRatingEvents([src({ trade_happened: "chat_only" })], NOW)[0]!.metadata.trade_weight).toBe(0.5);
  });
});
