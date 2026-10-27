/**
 * F7 (docs/audit/notification-defect-fix-design-2026-10-28.md) — 알림센터가 다시 그린 문구 = 발송 때 고른 문구.
 * 예전 오류: ① 접수 리마인드 제목이 「새 매장 주문」 ② 취소 요청이 「환불 요청」 ③ 반려 사유 누락 ④ 매장명 없을 때 「매장」 삽입.
 */
import { describe, expect, it } from "vitest";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  resolveCommerceNotificationInboxBody,
  resolveCommerceNotificationInboxTitle,
} from "@/lib/notifications/resolve-commerce-notification-inbox-text";

describe("F7 inbox re-render uses the sender's copy variant", () => {
  it("① accept reminder keeps the reminder title", () => {
    const meta = { kind: "store_order_accept_reminder_30s", store_display_name: "맛집", order_no: "SO1" };
    expect(resolveCommerceNotificationInboxTitle("ko", meta, "x")).toBe(
      notifySafeT("ko", "notify_commerce_owner_accept_reminder_title")
    );
  });

  it("② cancel request (request_type=cancel) is not shown as a refund request", () => {
    const meta = {
      kind: "store_order_refund_requested",
      request_type: "cancel",
      store_display_name: "맛집",
      order_no: "SO1",
    };
    expect(resolveCommerceNotificationInboxTitle("ko", meta, "x")).toBe(
      notifySafeT("ko", "notify_commerce_cancel_requested_title")
    );
    expect(resolveCommerceNotificationInboxBody("ko", meta, "x")).toBe(
      notifySafeT("ko", "notify_commerce_cancel_requested_body_named", { vars: { store: "맛집", orderNo: "SO1" } })
    );
    const refund = { ...meta, request_type: "refund" };
    expect(resolveCommerceNotificationInboxTitle("ko", refund, "x")).toBe(
      notifySafeT("ko", "notify_commerce_refund_requested_title")
    );
  });

  it("③ point charge rejection keeps the reason", () => {
    const meta = { kind: "user_point_charge_rejected", reason: "입금 확인 불가" };
    expect(resolveCommerceNotificationInboxBody("ko", meta, "x")).toBe(
      notifySafeT("ko", "notify_user_point_charge_rejected_reason_body", { vars: { reason: "입금 확인 불가" } })
    );
    expect(resolveCommerceNotificationInboxBody("ko", { kind: "user_point_charge_rejected" }, "x")).toBe(
      notifySafeT("ko", "notify_user_point_charge_rejected_body")
    );
  });

  it("④ no store name → unnamed variant (no 「매장」 inserted)", () => {
    const meta = { kind: "store_order_buyer_cancelled", order_no: "SO1" };
    const body = resolveCommerceNotificationInboxBody("ko", meta, "SO1 — 접수 전 취소");
    expect(body).toBe(notifySafeT("ko", "notify_commerce_buyer_cancelled_body", { vars: { orderNo: "SO1" } }));
    expect(body).not.toContain(notifySafeT("ko", "notify_commerce_store_fallback"));
    const named = resolveCommerceNotificationInboxBody("ko", { ...meta, store_display_name: "맛집" }, "x");
    expect(named).toBe(
      notifySafeT("ko", "notify_commerce_buyer_cancelled_body_named", { vars: { store: "맛집", orderNo: "SO1" } })
    );
  });
});
