/**
 * 읽음 범위 계약 — Owner 최종 결정 2026-11-01:
 * 「개별 1건으로 일괄 변경하지 않는다. 기존 글·주문·상품·방 단위 계약 유지. 푸시·종 팝업·전체 알림·앱 안 배너는
 *  같은 읽음 처리 함수. 글 상세 진입 = 그 글 알림 전체 읽음, 주문 상세 = 그 주문 관련 알림. 단순 목록 진입은 읽음 아님.」
 * 행 모양은 운영 DB 실측(2026-11-01, 읽기 전용)과 같다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapNotificationEventToInboxRow } from "@/lib/notifications/inbox-events-merge";
import { resolveInboxBellThreadRead } from "@/lib/notifications/inbox-read-bridge";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function ev(id: string, type: string, display_payload: Record<string, unknown>) {
  return {
    id,
    type: type as NotificationEventRow["type"],
    category: type as NotificationEventRow["category"],
    title: "t",
    body: "b",
    display_payload,
    read_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    dedupe_key: `k-${id}`,
    room_id: null,
  };
}

const COMMENT = ev("521444ba", "community_activity", {
  routeUrl: "/community/posts/3eb594f3",
  legacyMeta: { kind: "community_comment", post_id: "3eb594f3", comment_id: "9c10bd32" },
  legacyRefId: "3eb594f3",
  legacyDomain: "community_chat",
  legacyPushKind: "community",
  legacyNotificationType: "report",
});
const LIKE = ev("f8f63506", "community_activity", {
  routeUrl: "/community/posts/3a94bcfb",
  legacyMeta: { kind: "community_like", post_id: "3a94bcfb" },
  legacyPushKind: "community",
  legacyNotificationType: "report",
});
const ORDER = ev("c60dce1c", "order_status", {
  routeUrl: "/orders?expand=8ebb01bd",
  legacyMeta: { kind: "store_order_owner_status", order_id: "8ebb01bd", store_id: "076bffda" },
  legacyRefId: "8ebb01bd",
  legacyPushKind: "delivery",
  legacyNotificationType: "commerce",
});
const TRADE = ev("8cb9fbd7", "trade_status", {
  routeUrl: "/community-messenger/rooms/4d07ccd9?source=product_chat",
  legacyMeta: { kind: "trade_completed", room_id: "4d07ccd9", product_id: "608f7713" },
  legacyPushKind: "trade",
  legacyNotificationType: "status",
});

describe("read scope plan (one function for push · bell · full list · banner)", () => {
  it("comment / like → whole post", () => {
    expect(resolveInboxBellThreadRead(mapNotificationEventToInboxRow(COMMENT))).toMatchObject({
      threadId: "3eb594f3",
      threadType: "community_post",
    });
    expect(resolveInboxBellThreadRead(mapNotificationEventToInboxRow(LIKE))).toMatchObject({
      threadId: "3a94bcfb",
      threadType: "community_post",
    });
  });

  it("order status → that order", () => {
    expect(resolveInboxBellThreadRead(mapNotificationEventToInboxRow(ORDER))).toMatchObject({
      threadId: "8ebb01bd",
      threadType: "order",
    });
  });

  it("trade status → that product (status events only; chat stays on room read ACK)", () => {
    const plan = resolveInboxBellThreadRead(mapNotificationEventToInboxRow(TRADE));
    expect(plan?.threadId).toBe("608f7713");
  });

  it("all four entry points call the same server read function", () => {
    // 푸시 탭(열기)
    expect(read("app/api/me/notifications/read/route.ts")).toContain(
      "await patchInboxNotificationIdsRead(sb, userId, [eventId])"
    );
    // 종 팝업·전체 알림·앱 안 배너 → activateNotificationDestination(markRead) → PATCH /api/me/notifications {ids}
    expect(read("app/api/me/notifications/route.ts")).toContain("await patchInboxNotificationIdsRead(sb, userId, ids)");
    expect(read("components/philife/PhilifeHeaderNotificationInbox.tsx")).toContain("markRead: markIdsRead,");
    expect(read("components/my/MyNotificationsView.tsx")).toContain("markRead: markIdsRead,");
    const banner = read("components/notifications/InAppNotificationBannerHost.tsx");
    expect(banner).toContain("markRead: markBannerNotificationRead,");
    expect(banner).toContain('body: JSON.stringify({ ids }),');
  });

  it("destination screens keep the approved thread read on open (post · order · owner order)", () => {
    expect(read("components/community/CommunityDetail.tsx")).toContain('threadType: "community_post"');
    expect(read("components/mypage/MyStoreOrderDetailView.tsx")).toContain('threadType: "order"');
    expect(read("components/business/owner/OwnerStoreOrdersView.tsx")).toContain("postNotificationThreadRead(oid");
  });

  it("opening the bell or the notification list does not mark everything read (button only)", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    const calls = view.match(/markAllRead\(\)/g) ?? [];
    // 버튼(구 화면) 또는 「모두 읽음」 확인 창의 확인 버튼에서만 부른다(최종 설계 §2-4).
    const buttonCalls = view.match(/onClick=\{\(\) => void markAllRead\(\)\}/g) ?? [];
    const confirmCalls = view.match(/void markAllRead\(\)\.finally\(\(\) => setConfirmMarkAll\(false\)\)/g) ?? [];
    expect(calls.length).toBe(buttonCalls.length + confirmCalls.length);
    expect(confirmCalls.length).toBe(1);
    const bell = read("components/philife/PhilifeHeaderNotificationInbox.tsx");
    expect(bell).not.toContain("mark_all");
  });
});
