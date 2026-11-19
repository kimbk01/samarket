/**
 * @vitest-environment jsdom
 *
 * 2026-11-19 「거래 채팅」 칸 숫자 결함 — 설계 C1·C2·C3 (`docs/audit/remaining-items-2026-11-19.md` C-2, Owner 승인).
 * 재현(13:22 PHT Xiaomi zxzx11): 다른 채팅방 안에서 받은 거래 메시지가 칸 숫자에 안 들어가 2 그대로(실제 3).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch", () => ({
  prefetchDomainTradeListCanaryForHub: vi.fn(async () => {}),
  prefetchDomainStoreOrderCustomerListCanaryForHub: vi.fn(async () => {}),
}));
vi.mock("@/lib/community-messenger/unread/messenger-room-unread-authority", () => ({
  resolveMessengerRoomChatDomain: vi.fn(() => null),
}));

import { syncCommerceListUnreadFromParticipantFact } from "@/components/messenger/DomainRoomStateRealtimeHost";
import {
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
  type SoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import {
  prefetchDomainStoreOrderCustomerListCanaryForHub,
  prefetchDomainTradeListCanaryForHub,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch";
import { resolveMessengerRoomChatDomain } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import { stabilizeTradeListDto } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";

const ME = "u-me";

function tradeDto(unread: number): TradeListDto {
  return {
    authority: "domain_trade_list_canary",
    viewerUserId: ME,
    producedAt: "2026-11-19T00:00:00.000Z",
    hub: { roomCount: 1, unreadRoomCount: unread > 0 ? 1 : 0, latestRoomId: "t-1", previewText: "old" },
    rows: [
      {
        roomId: "t-1",
        chatDomain: "trade",
        domainIdentityKey: "trade:i1:s:b",
        itemId: "i1",
        sellerUserId: "s",
        buyerUserId: ME,
        viewerRole: "buyer",
        productTitle: "Item",
        productImageUrl: null,
        peerLabel: null,
        peerAvatarUrl: null,
        previewText: "old",
        statusBadge: null,
        unreadCount: unread,
        lastMessageAt: "2026-11-19T00:00:00.000Z",
        href: "/x",
      },
    ],
  } as unknown as TradeListDto;
}

function soDto(): SoCustomerListDto {
  return {
    authority: "domain_store_order_customer_list_canary",
    viewerUserId: ME,
    surfaceRole: "customer",
    producedAt: "2026-11-19T00:00:00.000Z",
    hub: { roomCount: 0, unreadRoomCount: 0, latestRoomId: null, previewText: "" },
    rows: [],
  } as unknown as SoCustomerListDto;
}

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("C1 — 다른 방 안에서도 참여자 안 읽음 증가가 거래 칸에 들어간다", () => {
  it("캐시에 있는 방: 안 읽음을 참여자 수로 덮어쓰고 칸 숫자(안 읽은 방 수)가 늘어난다", () => {
    primeDomainTradeListCanaryCache(stabilizeTradeListDto(tradeDto(0)).dto);
    const r = syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "t-1", unreadCount: 1, storeOrderRole: null });
    expect(r).toBe("patched");
    const cache = peekDomainTradeListCanaryCache(ME)!;
    expect(cache.rows[0]!.unreadCount).toBe(1);
    expect(cache.hub.unreadRoomCount).toBe(1);
  });

  it("같은 신호가 두 번 와도 같은 값(덮어쓰기)", () => {
    primeDomainTradeListCanaryCache(stabilizeTradeListDto(tradeDto(0)).dto);
    syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "t-1", unreadCount: 2, storeOrderRole: null });
    syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "t-1", unreadCount: 2, storeOrderRole: null });
    expect(peekDomainTradeListCanaryCache(ME)!.rows[0]!.unreadCount).toBe(2);
  });
});

describe("C3 — 캐시에 없는 방", () => {
  it("거래 방으로 확인되면 거래 캐시를 비우고 1회 다시 받는다", () => {
    primeDomainTradeListCanaryCache(stabilizeTradeListDto(tradeDto(0)).dto);
    vi.mocked(resolveMessengerRoomChatDomain).mockReturnValueOnce("trade");
    const r = syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "t-new", unreadCount: 1, storeOrderRole: null });
    expect(r).toBe("refetch_trade");
    expect(peekDomainTradeListCanaryCache(ME)).toBeNull();
    expect(prefetchDomainTradeListCanaryForHub).toHaveBeenCalledTimes(1);
  });

  it("고객 주문 방이면 주문 캐시를 비우고 1회 다시 받는다", () => {
    primeDomainStoreOrderCustomerListCanaryCache(soDto());
    const r = syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "so-new", unreadCount: 1, storeOrderRole: "customer" });
    expect(r).toBe("refetch_store_order");
    expect(peekDomainStoreOrderCustomerListCanaryCache(ME)).toBeNull();
    expect(prefetchDomainStoreOrderCustomerListCanaryForHub).toHaveBeenCalledTimes(1);
  });

  it("사장님 주문 방·종류를 모르는 방은 아무것도 안 한다", () => {
    primeDomainTradeListCanaryCache(stabilizeTradeListDto(tradeDto(0)).dto);
    primeDomainStoreOrderCustomerListCanaryCache(soDto());
    expect(syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "o-1", unreadCount: 1, storeOrderRole: "owner" })).toBe("skipped");
    expect(syncCommerceListUnreadFromParticipantFact({ viewerUserId: ME, roomId: "x-1", unreadCount: 1, storeOrderRole: null })).toBe("skipped");
    expect(peekDomainTradeListCanaryCache(ME)).not.toBeNull();
    expect(peekDomainStoreOrderCustomerListCanaryCache(ME)).not.toBeNull();
    expect(prefetchDomainTradeListCanaryForHub).not.toHaveBeenCalled();
  });
});

describe("배선 — 전역 처리기·신호·C2", () => {
  it("summary_patch 안 읽음 >0 이면 C1·C3 호출, 신호에 주문 역할을 싣는다", () => {
    const host = readFileSync(resolve(process.cwd(), "components/messenger/DomainRoomStateRealtimeHost.tsx"), "utf8");
    expect(host).toContain("} else if (unread != null && unread > 0) {");
    expect(host).toContain("syncCommerceListUnreadFromParticipantFact({");
    const hub = readFileSync(resolve(process.cwd(), "lib/community-messenger/notifications/use-cm-participants-hub-sync.ts"), "utf8");
    expect(hub).toMatch(/unreadCount: applied\.unreadCount,\s*storeOrderRole,/);
  });

  it("C2: 대화 홈 새 메시지로는 거래·주문 캐시 안 읽음을 늘리지 않는다", () => {
    const proj = readFileSync(resolve(process.cwd(), "lib/community-messenger/home/project-room-activity-to-home-list.ts"), "utf8");
    const fn = proj.slice(proj.indexOf("function routeDomainCanary("), proj.indexOf("function resolveCommerceDomainForCanary("));
    expect(fn).not.toContain("activity.boostUnread === true");
    expect(fn.match(/boostUnread: false,/g)?.length).toBe(2);
  });
});
