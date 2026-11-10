import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSwipeActions } from "@/lib/messenger-policy/chat-room-swipe-actions";
import {
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

describe("주문 채팅 고객 목록 — 나가기·밀기 (Owner 2026-11-10)", () => {
  it("밀기 = 읽음·나가기 2종, 보관 없음 / 주문 상태와 무관하게 나가기 가능", () => {
    const actions = getSwipeActions({
      policyType: "direct",
      listContext: "default",
      storeOrderCustomerList: true,
    });
    expect(actions.map((a) => a.kind)).toEqual(["read", "leave"]);
    expect(actions.every((a) => !a.disabled)).toBe(true);
  });

  it("매장 사장님은 주문 목록에서도 나가기 미노출 (L-7 유지)", () => {
    const owner = getSwipeActions({
      policyType: "direct",
      listContext: "default",
      viewerIsDeliveryStoreOwner: true,
      storeOrderCustomerList: true,
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
    // 거래 목록: 보관한 방은 목록 조회에서 제외 (방 화면 표시는 그대로)
    expect(loader).toContain('options?.inboxOnly ? q.eq("is_archived", false) : q');
    const tradeCompose = readFileSync(
      join(process.cwd(), "lib/messenger/contracts/domain-read-trade-list-compose.ts"),
      "utf8"
    );
    expect(tradeCompose).toContain("createTradeLiveBootstrapSource(sb, undefined, { inboxOnly: true })");
  });
});
