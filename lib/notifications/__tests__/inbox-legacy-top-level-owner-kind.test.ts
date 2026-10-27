/**
 * 재감사 D-1 (docs/audit/notification-full-reaudit-2026-10-27.md) — 하나의 알림 = 하나의 판정 입력.
 * kind·store_id 는 legacyMeta → 최상위 순서(resolveNotificationEventKind)로만 읽고, 숫자(A)·목록·탭·오너
 * 판정이 모두 같은 값을 쓴다. 화면 표시·이동용 meta 는 바꾸지 않는다(3e597af8f 의 오너 특례 meta 보충 대체).
 */
import { describe, expect, it } from "vitest";
import {
  applyInboxEligibilityFilters,
  classifyInboxRowMemberDomain,
  mapNotificationEventToInboxRow,
} from "@/lib/notifications/inbox-events-merge";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { buildNotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";
import { resolveInboxBellThreadRead } from "@/lib/notifications/inbox-read-bridge";

function event(
  id: string,
  type: string,
  payload: Record<string, unknown>,
  roomId: string | null = null
) {
  return {
    id,
    type,
    category: type,
    title: "t",
    body: null,
    display_payload: payload,
    read_at: null,
    created_at: "2026-06-10T00:00:00.000Z",
    dedupe_key: `k:${id}`,
    room_id: roomId,
  };
}

/** 숫자(A)와 목록이 같은 판정인지 — 계약 §7 「digit unread set = inbox unread set」. */
function digitAndList(e: ReturnType<typeof event>) {
  const digit = isMemberNotificationAUnread({ ...e, unread: true } as never);
  const row = mapNotificationEventToInboxRow(e as never);
  const eligible = applyInboxEligibilityFilters([row], {
    fetchUpper: 1,
    excludeChatMessageList: true,
    excludeOwnerList: true,
  });
  const listed = filterMemberNotificationAInboxRows(eligible).length === 1;
  return { digit, listed, row };
}

describe("D-1 one classification input for every surface", () => {
  it("legacy top-level owner fee row: excluded from digit and list, owner by event_kind, meta untouched", () => {
    const ownerFee = event("e1", "order_status", {
      kind: "store_point_deducted",
      store_id: "11111111-1111-1111-1111-111111111111",
      order_id: "22222222-2222-2222-2222-222222222222",
    });
    const { digit, listed, row } = digitAndList(ownerFee);
    expect(digit).toBe(false);
    expect(listed).toBe(false);
    expect(row.event_kind).toBe("store_point_deducted");
    expect(row.event_store_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(isOwnerStoreCommerceNotificationRow(row)).toBe(true);
    expect(row.meta?.kind).toBeUndefined();
  });

  it.each([
    ["admin_notice", { kind: "friend_request" }],
    ["admin_notice", { kind: "friend_accepted" }],
    ["admin_notice", { kind: "community_group_invite" }],
    ["community_activity", { legacyNotificationType: "status", legacyPushKind: "community", legacyMeta: { kind: "friend_request" } }],
    ["community_activity", { legacyNotificationType: "chat", legacyPushKind: "community", legacyMeta: { kind: "gift_transfer_offered" } }],
  ])("messenger-owned %s %j: neither digit nor list", (type, payload) => {
    const { digit, listed } = digitAndList(event("m1", type, payload));
    expect(digit).toBe(false);
    expect(listed).toBe(false);
  });

  it("room-bound missed call is B only: not in digit or list", () => {
    const { digit, listed } = digitAndList(event("c1", "missed_call", {}, "room-1"));
    expect(digit).toBe(false);
    expect(listed).toBe(false);
  });

  it("member A rows still match digit = list (community comment, notice)", () => {
    for (const e of [
      event("a1", "community_activity", { kind: "community_comment" }),
      event("a2", "notice_published", {}),
    ]) {
      const { digit, listed } = digitAndList(e);
      expect(digit).toBe(true);
      expect(listed).toBe(true);
    }
  });

  it("tab digit uses the same kind as the tab list (delivery ad result → marketing)", () => {
    const row = mapNotificationEventToInboxRow(
      event("d1", "order_status", {
        legacyNotificationType: "commerce",
        legacyPushKind: "delivery",
        legacyMeta: { kind: "delivery_ad_rejected" },
      }) as never
    );
    expect(classifyInboxRowMemberDomain(row)).toBe("marketing");
    const counts = buildNotificationCenterTabUnreadCounts({ memberRows: [row] });
    expect(counts.marketing).toBe(1);
    expect(counts.delivery).toBe(0);
  });
});

describe("D-4 status tap does not read chat events", () => {
  it("offer_accepted reads trade_status by product, not the room's trade_message", () => {
    const row = mapNotificationEventToInboxRow(
      event("o1", "trade_status", {
        legacyNotificationType: "status",
        legacyMeta: {
          kind: "trade_offer",
          event: "offer_accepted",
          product_id: "product-1",
          chat_room_id: "room-9",
        },
      }) as never
    );
    const plan = resolveInboxBellThreadRead(row);
    expect(plan?.readReason).toBe("trade_detail_opened");
    expect(plan?.threadId).toBe("product-1");
  });
});
