import { describe, expect, it } from "vitest";
import {
  assertBadgeExplainMatrix,
  buildBadgeExplainMatrix,
  BADGE_EXPLAIN_MATRIX_AUTHORITY,
} from "@/lib/notifications/badge-explain-matrix";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase 2-1 Badge Explain Matrix", () => {
  it("builds App Icon / Bottom / Trade / Customer / Owner as ID set + count", () => {
    const matrix = buildBadgeExplainMatrix({
      generalDirectRoomIds: ["g1", "g2", "g3", "g4"],
      groupRoomIds: ["grp1", "grp2", "grp3"],
      tradeRoomIds: ["t1", "t2", "t3", "t4", "t5"],
      customerOrderRoomIds: Array.from({ length: 21 }, (_, i) => `c${i}`),
      ownerOrderRoomIds: ["o1", "o2", "o3"],
      ownerOrderUnreadByStoreId: { storeA: 2, storeB: 1 },
      orphanMissedCallCount: 1,
      orphanMissedCallEventIds: ["miss1"],
    });

    expect(matrix.authority).toBe(BADGE_EXPLAIN_MATRIX_AUTHORITY);
    expect(matrix.appIcon.total).toBe(34);
    expect(matrix.appIcon.general).toEqual({ count: 4, roomIds: ["g1", "g2", "g3", "g4"] });
    expect(matrix.appIcon.group.count).toBe(3);
    expect(matrix.appIcon.trade.count).toBe(5);
    expect(matrix.appIcon.customerOrder.count).toBe(21);
    expect(matrix.appIcon.ownerOrder.count).toBe(3);
    expect(matrix.appIcon.missedCall).toEqual({ count: 1, eventIds: ["miss1"] });
    expect(matrix.bottom.total).toBe(33);
    expect(matrix.trade.count).toBe(5);
    expect(matrix.customer.count).toBe(21);
    expect(matrix.owner.count).toBe(3);
    expect(matrix.owner.byStoreId).toEqual({ storeA: 2, storeB: 1 });

    const asserted = assertBadgeExplainMatrix(matrix, {
      expectedAppIconTotal: 34,
      expectedBottomTotal: 33,
      expectedTradeTotal: 5,
      expectedCustomerTotal: 21,
      expectedOwnerTotal: 3,
      requireMissedCallEventIds: true,
    });
    expect(asserted).toEqual({ ok: true, errors: [] });
  });

  it("fails when count drifts from ID set length", () => {
    const matrix = buildBadgeExplainMatrix({
      generalDirectRoomIds: ["a"],
      groupRoomIds: [],
      tradeRoomIds: [],
      customerOrderRoomIds: [],
      ownerOrderRoomIds: [],
      orphanMissedCallCount: 0,
    });
    const broken = {
      ...matrix,
      appIcon: {
        ...matrix.appIcon,
        general: { count: 2, roomIds: ["a"] },
        total: 2,
      },
      bottom: {
        total: 2,
        general: { count: 2, roomIds: ["a"] },
        group: matrix.bottom.group,
        trade: matrix.bottom.trade,
        customerOrder: matrix.bottom.customerOrder,
      },
    };
    const asserted = assertBadgeExplainMatrix(broken);
    expect(asserted.ok).toBe(false);
    expect(asserted.errors.some((e) => e.includes("count!=|roomIds|"))).toBe(true);
  });

  it("HTTP builder wires explainMatrix (contract)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"),
      "utf8"
    );
    expect(src).toContain("buildBadgeExplainMatrix");
    expect(src).toContain("explainMatrix");
    expect(src).toContain("orphanMissedCallEventIds");
  });

  it("dedupes room ids in parts", () => {
    const matrix = buildBadgeExplainMatrix({
      generalDirectRoomIds: ["a", "a", "b"],
      groupRoomIds: [],
      tradeRoomIds: [],
      customerOrderRoomIds: [],
      ownerOrderRoomIds: [],
      orphanMissedCallCount: 0,
    });
    expect(matrix.appIcon.general).toEqual({ count: 2, roomIds: ["a", "b"] });
    expect(assertBadgeExplainMatrix(matrix).ok).toBe(true);
  });
});
