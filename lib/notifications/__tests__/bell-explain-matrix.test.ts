/**
 * Phase 3-1 — Bell Explain Matrix contracts.
 * DO NOT: Badge · RoomUnread · Heal · Legacy delete
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BELL_EXPLAIN_MATRIX_AUTHORITY,
  assertBellExplainMatrix,
  bellPresentationToExplainKind,
  buildBellExplainMatrix,
  listBellExplainEventIds,
} from "@/lib/notifications/bell-explain-matrix";

describe("Phase 3-1 Bell Explain Matrix", () => {
  it("authority id", () => {
    expect(BELL_EXPLAIN_MATRIX_AUTHORITY).toBe("bell_explain_v1");
  });

  it("maps presentation kinds to product Explain lines", () => {
    expect(bellPresentationToExplainKind("general_message")).toBe("generalMessage");
    expect(bellPresentationToExplainKind("customer_order_message")).toBe("customerOrder");
    expect(bellPresentationToExplainKind("owner_order_message")).toBe("ownerOrder");
    expect(bellPresentationToExplainKind("customer_order_status")).toBe("orderStatus");
    expect(bellPresentationToExplainKind("owner_order_status")).toBe("orderStatus");
    expect(bellPresentationToExplainKind("admin_notice")).toBe("systemAdmin");
    expect(bellPresentationToExplainKind("unsupported")).toBe("excluded");
  });

  it("sums non-chat NotificationAttention into digit total; chat kinds quarantine", () => {
    const matrix = buildBellExplainMatrix([
      { id: "g1", type: "chat_message", category: "chat", unread: true, read_at: null },
      { id: "g2", type: "chat_message", category: "chat", unread: true, read_at: null },
      { id: "gr1", type: "group_message", category: "group", unread: true, read_at: null },
      { id: "t1", type: "trade_message", category: "trade", unread: true, read_at: null },
      {
        id: "c1",
        type: "store_order_message",
        category: "store",
        unread: true,
        read_at: null,
        display_payload: {},
      },
      {
        id: "o1",
        type: "store_order_message",
        category: "store",
        unread: true,
        read_at: null,
        display_payload: { viewerRole: "owner", routeUrl: "/stores/owner/orders" },
      },
      {
        id: "ts1",
        type: "trade_status",
        category: "trade_status",
        unread: true,
        read_at: null,
        display_payload: { product_id: "p1", legacyMeta: { product_id: "p1" } },
      },
      {
        id: "os1",
        type: "order_status",
        category: "order_status",
        unread: true,
        read_at: null,
        display_payload: { legacyMeta: { order_id: "ord1", kind: "store_order_owner_status" } },
      },
      { id: "m1", type: "missed_call", category: "missed_call", unread: true, read_at: null },
      { id: "a1", type: "admin_notice", category: "admin_notice", unread: true, read_at: null },
      {
        id: "x1",
        type: "admin_marketing_banner",
        category: "admin_marketing_banner",
        unread: true,
        read_at: null,
      },
    ]);

    // Phase B digit = trade_status + order_status + orphan missed + admin (4), not chat messages.
    expect(matrix.total).toBe(4);
    expect(matrix.generalMessage.count).toBe(2);
    expect(matrix.groupMessage.count).toBe(1);
    expect(matrix.tradeMessage.count).toBe(1);
    expect(matrix.customerOrder.count).toBe(1);
    expect(matrix.ownerOrder.count).toBe(1);
    expect(matrix.tradeStatus.count).toBe(1);
    expect(matrix.orderStatus.count).toBe(1);
    expect(matrix.missedCall.count).toBe(1);
    expect(matrix.systemAdmin.count).toBe(1);
    expect(matrix.excludedFromDigit.eventIds).toEqual(
      expect.arrayContaining(["g1", "g2", "gr1", "t1", "c1", "o1", "x1"])
    );
    expect(assertBellExplainMatrix(matrix, { expectedBellTotal: 4 }).ok).toBe(true);
    expect(listBellExplainEventIds(matrix).length).toBeGreaterThanOrEqual(4);
  });

  it("HTTP builder wires bellExplainMatrix (contract)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"),
      "utf8"
    );
    expect(src).toContain("bellExplainMatrix");
    expect(src).toContain("buildBellExplainMatrix");
    expect(src).toContain("loadBellExplainUnreadEventRows");
    expect(src).toContain("buildUnifiedAppIconProjection");
  });
});
