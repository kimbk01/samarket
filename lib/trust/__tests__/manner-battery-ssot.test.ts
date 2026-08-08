/**
 * Manner Battery calculator + policy contracts (T1–T18 subset as pure unit tests).
 */
import { describe, expect, it } from "vitest";
import { calculateMannerBattery, type CalculatorTrustEvent } from "@/lib/trust/manner-battery-calculator";
import {
  MANNER_NEVER_SCORE_ELIGIBLE,
  MANNER_POLICY_VERSION,
  MANNER_SCORE_NEUTRAL,
  buildManualAdjustmentIdempotencyKey,
  buildTradeCompletedIdempotencyKey,
  buildTradeReviewIdempotencyKey,
} from "@/lib/trust/manner-battery-policy-v1";
import { applyTrustScoreDelta } from "@/lib/trust/trust-score-apply";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const asOf = "2026-08-08T00:00:00.000Z";

function ev(partial: Partial<CalculatorTrustEvent> & Pick<CalculatorTrustEvent, "id" | "event_type">): CalculatorTrustEvent {
  return {
    member_id: "m1",
    domain: "trade",
    direction: "positive",
    status: "confirmed",
    occurred_at: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

describe("Manner Battery SSOT calculator", () => {
  it("T1 new member / no events = 50", () => {
    const r = calculateMannerBattery({ events: [], asOf });
    expect(r.manner_battery_percent).toBe(MANNER_SCORE_NEUTRAL);
    expect(r.policy_version).toBe(MANNER_POLICY_VERSION);
  });

  it("T4/T5 completions + good review raise above 50", () => {
    const r = calculateMannerBattery({
      asOf,
      events: [
        ev({ id: "1", event_type: "trade_completed", counterparty_id: "c1" }),
        ev({ id: "2", event_type: "trade_completed", counterparty_id: "c2", occurred_at: "2026-06-02T00:00:00.000Z" }),
        ev({ id: "3", event_type: "trade_review_good", direction: "positive", counterparty_id: "c1" }),
      ],
    });
    expect(r.manner_battery_percent).toBeGreaterThan(50);
    expect(r.trade_completed_count).toBe(2);
    expect(r.review_good_count).toBe(1);
  });

  it("T6 normal review is direction-neutral", () => {
    const base = calculateMannerBattery({ events: [], asOf });
    const withNormal = calculateMannerBattery({
      asOf,
      events: [ev({ id: "n", event_type: "trade_review_normal", direction: "neutral" })],
    });
    expect(withNormal.manner_battery_percent).toBe(base.manner_battery_percent);
    expect(withNormal.review_normal_count).toBe(1);
  });

  it("T7 bad review is low negative", () => {
    const pos = calculateMannerBattery({
      asOf,
      events: [ev({ id: "1", event_type: "trade_completed" })],
    });
    const mixed = calculateMannerBattery({
      asOf,
      events: [
        ev({ id: "1", event_type: "trade_completed" }),
        ev({ id: "b", event_type: "trade_review_bad", direction: "negative" }),
      ],
    });
    expect(mixed.manner_battery_percent).toBeLessThan(pos.manner_battery_percent);
    expect(mixed.manner_battery_percent).toBeGreaterThan(40);
  });

  it("T8/T9 pending report / dispute_hold do not change score", () => {
    const base = calculateMannerBattery({ events: [], asOf });
    const withJunk = calculateMannerBattery({
      asOf,
      events: [
        ev({ id: "r", event_type: "report_created", domain: "platform", direction: "negative" }),
        ev({ id: "d", event_type: "dispute_hold", domain: "trade", direction: "neutral" }),
      ],
    });
    expect(withJunk.manner_battery_percent).toBe(base.manner_battery_percent);
    expect(MANNER_NEVER_SCORE_ELIGIBLE.has("report_created")).toBe(true);
    expect(MANNER_NEVER_SCORE_ELIGIBLE.has("dispute_hold")).toBe(true);
  });

  it("T10/T11/T12 store rating / community activity / delivery volume excluded", () => {
    const base = calculateMannerBattery({ events: [], asOf });
    const withNoise = calculateMannerBattery({
      asOf,
      events: [
        ev({ id: "s", event_type: "store_rating", domain: "delivery", direction: "positive" }),
        ev({ id: "c", event_type: "community_like", domain: "community", direction: "positive" }),
        ev({ id: "o", event_type: "delivery_order_completed", domain: "delivery", direction: "positive" }),
      ],
    });
    expect(withNoise.manner_battery_percent).toBe(base.manner_battery_percent);
  });

  it("T13 reversal excludes event from score", () => {
    const active = calculateMannerBattery({
      asOf,
      events: [ev({ id: "1", event_type: "trade_completed" })],
    });
    const reversed = calculateMannerBattery({
      asOf,
      events: [ev({ id: "1", event_type: "trade_completed", status: "reversed" })],
    });
    expect(active.manner_battery_percent).toBeGreaterThan(50);
    expect(reversed.manner_battery_percent).toBe(50);
  });

  it("T14 events older than 365d excluded", () => {
    const r = calculateMannerBattery({
      asOf,
      events: [ev({ id: "old", event_type: "trade_completed", occurred_at: "2024-01-01T00:00:00.000Z" })],
    });
    expect(r.manner_battery_percent).toBe(50);
    expect(r.eligible_event_count).toBe(0);
  });

  it("T15 same ledger+policy+as_of = same score", () => {
    const events = [
      ev({ id: "1", event_type: "trade_completed" }),
      ev({ id: "2", event_type: "trade_review_good" }),
    ];
    const a = calculateMannerBattery({ events, asOf });
    const b = calculateMannerBattery({ events, asOf });
    expect(a).toEqual(b);
  });

  it("bounded: never below 0 or above 100", () => {
    const manyBad = Array.from({ length: 40 }, (_, i) =>
      ev({ id: `b${i}`, event_type: "trade_review_bad", direction: "negative" })
    );
    const manyGood = Array.from({ length: 40 }, (_, i) =>
      ev({ id: `g${i}`, event_type: "trade_completed" })
    );
    expect(calculateMannerBattery({ events: manyBad, asOf }).manner_battery_percent).toBeGreaterThanOrEqual(0);
    expect(calculateMannerBattery({ events: manyGood, asOf }).manner_battery_percent).toBeLessThanOrEqual(100);
  });

  it("community/delivery domain events with reserved types stay inactive for v1 scoring", () => {
    const r = calculateMannerBattery({
      asOf,
      events: [
        ev({
          id: "cp",
          event_type: "community_positive_trust",
          domain: "community",
          direction: "positive",
        }),
        ev({
          id: "da",
          event_type: "delivery_member_abuse_confirmed",
          domain: "delivery",
          direction: "negative",
        }),
      ],
    });
    expect(r.manner_battery_percent).toBe(50);
    expect(r.active_domains).toEqual(["trade"]);
  });
});

describe("Manner Battery SSOT structural contracts", () => {
  it("T2/T3 idempotency key builders are unique per completion/review+member", () => {
    expect(buildTradeCompletedIdempotencyKey("pc1", "m1")).not.toBe(
      buildTradeCompletedIdempotencyKey("pc1", "m2")
    );
    expect(buildTradeReviewIdempotencyKey("rv1", "m1")).toBe("trade_review:rv1:m1");
    expect(buildManualAdjustmentIdempotencyKey("adj1", "m1")).toContain("manual_adjustment:");
  });

  it("T17 admin route rejects absolute newScore; uses recordTrustEvent", () => {
    const src = readFileSync(path.join(root, "app/api/admin/trust-score/route.ts"), "utf8");
    expect(src).toContain("recordTrustEvent");
    expect(src).toContain("manual_adjustment");
    expect(src).toContain("absolute newScore overwrite is forbidden");
    expect(src).not.toContain("applyTrustScoreDelta");
  });

  it("T18 legacy applyTrustScoreDelta throws (writer removed)", async () => {
    await expect(
      applyTrustScoreDelta({} as never, {
        userId: "x",
        sourceType: "admin_adjust",
        baseDelta: 1,
      })
    ).rejects.toThrow(/recordTrustEvent/);
  });

  it("buyer-issue does not apply report penalty", () => {
    const src = readFileSync(
      path.join(root, "app/api/trade/product-chat/[roomId]/buyer-issue/route.ts"),
      "utf8"
    );
    expect(src).not.toContain("applyTrustScoreDelta");
    expect(src).toContain("REPORT_CREATED is NOT score-eligible");
  });

  it("trade writers use recordTrustEvent", () => {
    const confirm = readFileSync(
      path.join(root, "app/api/trade/product-chat/[roomId]/buyer-confirm/route.ts"),
      "utf8"
    );
    const review = readFileSync(
      path.join(root, "app/api/trade/product-chat/[roomId]/submit-review/route.ts"),
      "utf8"
    );
    expect(confirm).toContain("recordTrustEvent");
    expect(confirm).toContain("trade_completed");
    expect(review).toContain("recordTrustEvent");
    expect(review).toContain("trade_review_");
  });

  it("SSOT doc exists and matches policy version", () => {
    const doc = readFileSync(
      path.join(root, "docs/member-trust/dibay-manner-battery-ssot.md"),
      "utf8"
    );
    expect(doc).toContain("manner_trade_v1");
    expect(doc).toContain("NO DATA ≠ BAD TRUST");
    expect(doc).toContain("Report created ≠ penalty");
  });
});
