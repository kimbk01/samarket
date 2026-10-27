/**
 * FAIL② (실기기 V1, 2026-10-27) — legacy backfill 오너 행은 kind·store_id 가 display_payload 최상위에만 있다.
 * 숫자(A)와 목록이 같은 판정을 써야 한다: 오너 운영 종류면 목록에서도 빠지고, 다른 종류의 최상위 kind 는 건드리지 않는다.
 */
import { describe, expect, it } from "vitest";
import { mapNotificationEventToInboxRow } from "@/lib/notifications/inbox-events-merge";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

function legacyRow(id: string, payload: Record<string, unknown>, type = "order_status") {
  return {
    id,
    type,
    category: type,
    title: "주문 수수료 차감",
    body: null,
    display_payload: payload,
    read_at: null,
    created_at: "2026-06-10T00:00:00.000Z",
    dedupe_key: `legacy:notifications:${id}`,
    room_id: null,
  };
}

describe("legacy top-level owner kind", () => {
  const ownerFee = legacyRow("e1", {
    kind: "store_point_deducted",
    store_id: "11111111-1111-1111-1111-111111111111",
    order_id: "22222222-2222-2222-2222-222222222222",
    legacyBackfill: true,
  });

  it("maps top-level owner kind·store_id·order_id into meta", () => {
    const row = mapNotificationEventToInboxRow(ownerFee as never);
    expect(row.meta?.kind).toBe("store_point_deducted");
    expect(row.meta?.store_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(row.meta?.order_id).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("digit and member list agree: owner fee row is in neither", () => {
    expect(isMemberNotificationAUnread({ ...ownerFee, unread: true } as never)).toBe(false);
    const listed = filterMemberNotificationAInboxRows([mapNotificationEventToInboxRow(ownerFee as never)]);
    expect(listed).toHaveLength(0);
  });

  it("non-owner top-level kind is not copied into meta", () => {
    const friend = legacyRow("e2", { kind: "friend_request" }, "community_activity");
    const row = mapNotificationEventToInboxRow(friend as never);
    expect(row.meta?.kind).not.toBe("friend_request");
  });
});
