import { describe, expect, it } from "vitest";
import { resolveCommerceNotificationInboxTitle } from "@/lib/notifications/resolve-commerce-notification-inbox-text";

/** 재감사 2026-11-02 S3 — 신규 주문 제목 앞에 매장명(여러 매장 사장님). 매장명을 못 찾으면 이전 제목. */
describe("owner new order title with store name", () => {
  it("meta store_display_name → [가게] 제목", () => {
    expect(
      resolveCommerceNotificationInboxTitle("ko", { kind: "store_order_created", store_display_name: "디바이 분식" }, "새 주문이 들어왔어요")
    ).toBe("[디바이 분식] 새 주문이 들어왔어요");
    expect(
      resolveCommerceNotificationInboxTitle("en", { kind: "store_order_created", store_display_name: "Dibay Snack" }, "x")
    ).toBe("[Dibay Snack] You have a new order");
  });
  it("옛 행: 본문 「매장명」에서 찾는다 · 없으면 이전 제목", () => {
    expect(
      resolveCommerceNotificationInboxTitle("ko", { kind: "store_order_created" }, "새 주문이 들어왔어요", "「가게A」 새 주문 · 1건")
    ).toBe("[가게A] 새 주문이 들어왔어요");
    expect(resolveCommerceNotificationInboxTitle("ko", { kind: "store_order_created" }, "새 주문이 들어왔어요", "주문 1건")).toBe(
      "새 주문이 들어왔어요"
    );
  });
});
