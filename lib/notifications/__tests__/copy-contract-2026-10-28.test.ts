/**
 * 4절 문구 계약 (docs/audit/notification-defect-fix-design-2026-10-28.md · Owner 승인 2026-10-28).
 * - 고객이 받는 주문 문구에는 내부 주문번호를 넣지 않는다.
 * - 고객센터·거래·모임·포인트·친구·선물·댓글 문구는 「~요」체, 제목 = 무슨 일.
 */
import { describe, expect, it } from "vitest";
import { notificationMessages } from "@/lib/i18n/catalog/notifications";

const ko = notificationMessages.ko as Record<string, string>;
const en = notificationMessages.en as Record<string, string>;

const BUYER_ORDER_KEY =
  /^notify_commerce_(owner_status_[a-z_]+|payment_done_(title|body)|payment_failed_body|refund_processed_body|refund_rejected_body[a-z_]*|cancel_rejected_body[a-z_]*|auto_completed_body|admin_cancelled_body|accept_timeout_cancelled_body|cancel_request_approved_body|delivery_sync_arrived_body)$/;

const HAEYO_KEYS = [
  "notify_support_admin_replied_title",
  "notify_support_case_resolved_title",
  "notify_support_case_resolved_body",
  "notify_support_case_reopened_title",
  "notify_support_case_reopened_body",
  "notify_trade_buyer_confirmed_title",
  "notify_trade_buyer_confirmed_body",
  "notify_trade_seller_completed_title",
  "notify_trade_seller_completed_body",
  "notify_meeting_kicked_title",
  "notify_meeting_kicked_body",
  "notify_meeting_rejected_title",
  "notify_meeting_banned_title",
  "notify_meeting_banned_body",
  "notify_meeting_approved_title",
  "notify_meeting_approved_body",
  "notify_user_point_charge_approved_title",
  "notify_user_point_charge_rejected_title",
  "notify_friend_request_received_title",
  "notify_gift_transfer_offered_title",
  "notify_community_comment_title",
  "notify_commerce_owner_status_accepted_title",
  "notify_commerce_payment_done_title",
  "notify_commerce_new_order_title",
  "notify_commerce_owner_accept_reminder_title",
];

describe("notification copy contract (2026-10-28)", () => {
  it("customer order copy carries no internal order number", () => {
    const keys = Object.keys(ko).filter((k) => BUYER_ORDER_KEY.test(k));
    expect(keys.length).toBeGreaterThan(15);
    for (const k of keys) {
      expect(ko[k], k).not.toContain("{orderNo}");
      expect(en[k], k).not.toContain("{orderNo}");
    }
  });

  it("approved titles/bodies use 「~요」체 (no 「~습니다」)", () => {
    for (const k of HAEYO_KEYS) {
      expect(ko[k], k).toBeTruthy();
      expect(ko[k], k).not.toMatch(/습니다\.?$/);
      expect(en[k], k).toBeTruthy();
    }
  });

  it("support titles do not carry the internal case number", () => {
    for (const k of ["notify_support_admin_replied_title", "notify_support_case_resolved_title", "notify_support_case_reopened_title"]) {
      expect(ko[k]).not.toMatch(/SC-|\{/);
    }
  });
});
