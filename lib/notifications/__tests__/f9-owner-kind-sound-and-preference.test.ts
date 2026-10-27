/**
 * F9 (docs/audit/notification-defect-fix-design-2026-10-28.md) — 오너 종류 누락분.
 * - 설정 레지스트리: 접수 시간초과 자동취소가 없어 수신 역할을 owner 로 추론하지 못했다 → 추가.
 * - 소리: 접수 시간초과 자동취소 = 오너 주문 취소음(고객 취소와 같은 키). 포인트 종류 소리는
 *   W2-c(D1 결정 전 BLOCKED)라 매핑을 바꾸지 않는다 — 현재 키가 유지되는지만 고정한다.
 */
import { describe, expect, it } from "vitest";
import { resolveNotificationSoundEventKeyFromRow } from "@/lib/notifications/notification-sound-event-key-from-row";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";

const ownerRow = (kind: string) => ({
  notification_type: "commerce",
  event_type: "order_status",
  meta: { kind },
});

describe("F9 owner kinds", () => {
  it("accept timeout auto-cancel resolves the owner preference row", () => {
    const policy = getNotificationPreferencePolicy({
      metaKind: "store_order_accept_timeout_cancelled",
      eventType: "order_status",
    } as never);
    expect(policy?.recipientRole).toBe("owner");
  });

  it("accept timeout auto-cancel rings the owner cancel sound", () => {
    expect(resolveNotificationSoundEventKeyFromRow(ownerRow("store_order_accept_timeout_cancelled") as never)).toBe(
      "delivery_order_cancelled_owner"
    );
  });

  it("owner point kinds keep the owner order sound (W2-c BLOCKED · no mapping change)", () => {
    for (const kind of [
      "store_point_blocked",
      "store_point_deducted",
      "store_point_account_replied",
    ]) {
      expect(resolveNotificationSoundEventKeyFromRow(ownerRow(kind) as never)).toBe("delivery_order_created_owner");
    }
  });
});
