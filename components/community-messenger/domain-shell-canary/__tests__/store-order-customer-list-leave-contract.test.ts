import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSwipeActions } from "@/lib/messenger-policy/chat-room-swipe-actions";
import {
  domainStoreOrderListRowLeaveAllowed,
  domainStoreOrderListRowToUnifiedItem,
  type DomainStoreOrderListRow,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-list-row-to-unified-item";

const baseRow: DomainStoreOrderListRow = {
  roomId: "room-1",
  chatDomain: "store_order",
  domainIdentityKey: "so:order:order-1",
  orderId: "order-1",
  storeName: "나의 오른손딸방",
  storeImageUrl: null,
  previewText: "주문이 완료됐어요",
  statusBadge: "완료",
  storeId: "store-1",
  orderStatus: "completed",
  fulfillmentType: "local_delivery",
  isMuted: false,
  unreadCount: 2,
  lastMessageAt: "2026-10-14T02:08:00.000Z",
  href: "/community-messenger/rooms/room-1",
  exposesMemberIdentity: false,
};

describe("주문 채팅 고객 목록 — 나가기·밀기 (Owner 2026-11-10 1단계)", () => {
  it("끝난 주문(완료·취소·환불)만 나가기 허용, 진행 중·상태 모름은 불가", () => {
    for (const s of ["completed", "cancelled", "refunded"]) {
      expect(domainStoreOrderListRowLeaveAllowed({ orderStatus: s })).toBe(true);
    }
    for (const s of ["pending", "accepted", "preparing", "delivering", "cancel_requested", "refund_requested"]) {
      expect(domainStoreOrderListRowLeaveAllowed({ orderStatus: s })).toBe(false);
    }
    expect(domainStoreOrderListRowLeaveAllowed({ orderStatus: undefined })).toBe(false);
    expect(domainStoreOrderListRowLeaveAllowed({ orderStatus: null })).toBe(false);
  });

  it("밀기 = 읽음·나가기 2종, 보관 없음 / 진행 중은 나가기 비활성 + 사유", () => {
    const done = getSwipeActions({
      policyType: "direct",
      listContext: "default",
      storeOrderCustomerList: { leaveAllowed: true },
    });
    expect(done.map((a) => a.kind)).toEqual(["read", "leave"]);
    expect(done[1]!.disabled).toBe(false);

    const live = getSwipeActions({
      policyType: "direct",
      listContext: "default",
      storeOrderCustomerList: { leaveAllowed: false },
    });
    expect(live.map((a) => a.kind)).toEqual(["read", "leave"]);
    expect(live[1]!.disabled).toBe(true);
    expect(live[1]!.disabledReasonKey).toBe("cm_ui_order_chat_leave_in_progress");
  });

  it("매장 사장님은 주문 목록에서도 나가기 미노출 (L-7 유지)", () => {
    const owner = getSwipeActions({
      policyType: "direct",
      listContext: "default",
      viewerIsDeliveryStoreOwner: true,
      storeOrderCustomerList: { leaveAllowed: true },
    });
    expect(owner.map((a) => a.kind)).toEqual(["read"]);
  });

  it("행 변환: store_order 도메인·주문 상태·알림 끄기·나가기 확인 문구용 키", () => {
    const item = domainStoreOrderListRowToUnifiedItem({ ...baseRow, isMuted: true }, "viewer-1");
    expect(item.room.id).toBe("room-1");
    expect(item.room.chatDomain).toBe("store_order");
    expect(item.room.domainIdentityKey).toBe("so:order:order-1");
    expect(item.room.messengerDirectKey).toBe("store_order:order-1");
    expect(item.room.isMuted).toBe(true);
    expect(item.room.unreadCount).toBe(2);
    expect(item.room.contextMeta?.kind).toBe("delivery");
    expect(item.room.contextMeta?.orderStatus).toBe("completed");
    expect(item.room.contextMeta?.storeDisplayName).toBe("나의 오른손딸방");
  });

  it("목록 조회는 고객 참여 행 기준(inboxOnly) — 방 화면 표시는 그대로", () => {
    const compose = readFileSync(
      join(process.cwd(), "lib/messenger/contracts/domain-read-store-order-customer-list-compose.ts"),
      "utf8"
    );
    expect(compose).toContain("createStoreOrderCustomerLiveBootstrapSource(sb, undefined, { inboxOnly: true })");
    const presentation = readFileSync(
      join(process.cwd(), "lib/messenger/contracts/domain-read-room-presentation-compose.ts"),
      "utf8"
    );
    expect(presentation).not.toContain("inboxOnly");
    const loader = readFileSync(
      join(process.cwd(), "lib/messenger/contracts/phase11b-live-domain-loaders.ts"),
      "utf8"
    );
    expect(loader).toContain("options?.inboxOnly && !activeParticipantRoomIds.has(");
  });
});
