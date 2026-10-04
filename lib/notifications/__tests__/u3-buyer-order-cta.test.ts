/**
 * U3 — CTA-01: buyer store-order notifications deep-link to the order card
 * (`buyerStoreOrderDetailPath` → `/orders?expand={id}`), not the order list.
 * CTA-04: review owner-reply notification links the buyer's reviewed order, never `/stores/owner/*`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));
vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({
  markOrderNotificationsRead: vi.fn(async () => 1),
}));

import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import * as commerce from "@/lib/notifications/notify-store-commerce";
import { buyerStoreOrderDetailPath } from "@/lib/delivery/customer/navigate-to-buyer-store-order-detail";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import { resolveNotificationDestinationHint } from "@/lib/notifications/notification-destination-hint";

function makeSb() {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.or = vi.fn(async () => ({ error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: { preferred_language: "ko", store_name: "Test Store" } }));
  return {
    from: vi.fn(() => ({ update: vi.fn(() => chain), select: vi.fn(() => chain) })),
  } as never;
}

const base = { buyerUserId: "buyer-1", orderId: " order-abc ", orderNo: "SO1", storeId: "store-1" };
const EXPECTED = "/orders?expand=order-abc";

describe("CTA-01 buyer order notifications link to the order card", () => {
  beforeEach(() => vi.clearAllMocks());

  const cases: Array<[string, () => Promise<void>]> = [
    ["payment completed", () => commerce.notifyBuyerStorePaymentCompleted(makeSb(), base)],
    ["owner status", () => commerce.notifyBuyerStoreOrderOwnerStatus(makeSb(), { ...base, nextStatus: "preparing" })],
    ["payment failed", () => commerce.notifyBuyerStorePaymentFailed(makeSb(), base)],
    ["refund approved", () => commerce.notifyBuyerStoreRefundApproved(makeSb(), base)],
    ["refund rejected", () => commerce.notifyBuyerStoreRefundRejected(makeSb(), { ...base, reason: "x" })],
    ["auto completed", () => commerce.notifyBuyerStoreOrderAutoCompleted(makeSb(), base)],
  ];
  for (const [label, run] of cases) {
    it(label, async () => {
      await run();
      expect(appendUserNotification).toHaveBeenCalledTimes(1);
      const row = vi.mocked(appendUserNotification).mock.calls[0]![1] as {
        link_url: string;
        meta: Record<string, unknown>;
      };
      expect(row.link_url).toBe(EXPECTED);
      expect(row.meta.order_id).toBe("order-abc");
    });
  }

  it("canonical path survives the notification safe-route gate and is buyer-side", () => {
    expect(buyerStoreOrderDetailPath("order-abc")).toBe(EXPECTED);
    expect(resolveSafeNotificationInternalRoute(EXPECTED, null)).toBe(EXPECTED);
    expect(EXPECTED.includes("/stores/owner")).toBe(false);
  });

  it("no buyer notifier still links the order list constant", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/notify-store-commerce.ts"), "utf8");
    expect(src).not.toContain('"/my/store-orders"');
  });
});

describe("CTA-04 review owner-reply links the buyer's order", () => {
  it("uses buyerStoreOrderDetailPath(order_id) with /orders fallback, never owner console", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/me/stores/[storeId]/reviews/[reviewId]/reply/route.ts"),
      "utf8"
    );
    expect(src).toContain('link_url: orderId ? buyerStoreOrderDetailPath(orderId) : "/orders"');
    expect(src).not.toContain("link_url: `/stores/owner/reviews`");
  });
});

describe("destination hint for canonical buyer order path", () => {
  it("labels order detail vs list", () => {
    expect(resolveNotificationDestinationHint(EXPECTED, "ko")).toBe("주문 상세로 이동");
    expect(resolveNotificationDestinationHint(EXPECTED, "en")).toBe("Open order detail");
    expect(resolveNotificationDestinationHint("/orders", "ko")).toBe("주문 목록으로 이동");
    expect(resolveNotificationDestinationHint("/my/store-orders", "ko")).toBe("주문 목록으로 이동");
  });
});
