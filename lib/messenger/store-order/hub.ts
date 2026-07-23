/**
 * StoreOrder HubPort — 홈에는 Hub VM 만. Order List 행을 inbox에 넣지 않음.
 *
 * CONTRACT (Phase 11B-Fix):
 * Hub is derived only from the same StoreOrderSnapshot.rows (customer|owner surface).
 * DO NOT mix surfaces or re-query raw DB for the hub room.
 *
 * unreadCount on rows must already be targets-aligned (customer: buyer_order;
 * owner: owner_order_chat). DO NOT reintroduce participants.unread_count here.
 */
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";
import { assertDomainAllowedOnHomeInboxList } from "@/lib/messenger/contracts/home-surface";
import { resolveStoreOrderPreview } from "@/lib/messenger/store-order/preview";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import { STORE_ORDER_LIST_HREF, type StoreOrderHubViewModel } from "@/lib/messenger/store-order/ux-contract";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

function normalizeActivityAt(at: string | null | undefined): string | null {
  const t = typeof at === "string" ? at.trim() : "";
  return t || null;
}

export function buildStoreOrderHubViewModel(
  rows: ReadonlyArray<StoreOrderListItem>
): StoreOrderHubViewModel {
  for (const r of rows) {
    if (r.chatDomain !== STORE_ORDER_DOMAIN) {
      throw new Error("dibay_store_order_hub_foreign_row");
    }
  }
  const latest = selectLatestRowByActivityAt(rows, (r) => ({
    activityAt: r.latestChatMessageAt,
    tieKey: r.roomId,
  }));
  const preview = latest
    ? resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: {
          text: latest.latestChatMessageText,
          messageType: latest.latestChatMessageType,
          isSystemAllowed: true,
        },
      })
    : resolveStoreOrderPreview({ chatDomain: STORE_ORDER_DOMAIN, latestChatMessage: null });
  const unreadCount = rows.filter((r) => r.unreadCount > 0).length;
  return {
    domain: STORE_ORDER_DOMAIN,
    roomCount: rows.length,
    unreadCount,
    previewText: preview.text,
    lastEventAt: latest ? normalizeActivityAt(latest.latestChatMessageAt) : null,
    latestRoomId: latest?.roomId ?? null,
    latestDomainIdentityKey: latest?.domainIdentityKey ?? null,
    hrefToOrderList: STORE_ORDER_LIST_HREF,
  };
}

export function assertHomeInboxRejectsStoreOrderDomain(): void {
  assertDomainAllowedOnHomeInboxList(STORE_ORDER_DOMAIN);
}
