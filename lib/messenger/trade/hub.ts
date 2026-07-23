/**
 * trade Hub — 홈에는 Hub VM만. inbox에 trade Domain 허용 시도시 fail-closed 헬퍼.
 *
 * CONTRACT (Phase 11B-Fix):
 * Hub is derived only from the same TradeSnapshot.rows.
 * DO NOT re-query raw DB / messages to pick the hub room.
 */
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";
import { assertDomainAllowedOnHomeInboxList } from "@/lib/messenger/contracts/home-surface";
import { resolveTradePreview } from "@/lib/messenger/trade/preview";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
import { TRADE_LIST_HREF, type TradeHubViewModel } from "@/lib/messenger/trade/ux-contract";
import type { TradeListItem } from "@/lib/messenger/trade/types";

function normalizeActivityAt(at: string | null | undefined): string | null {
  const t = typeof at === "string" ? at.trim() : "";
  return t || null;
}

export function buildTradeHubViewModel(rows: ReadonlyArray<TradeListItem>): TradeHubViewModel {
  for (const r of rows) {
    if (r.chatDomain !== TRADE_DOMAIN) {
      throw new Error("dibay_trade_hub_foreign_row");
    }
  }
  const latest = selectLatestRowByActivityAt(rows, (r) => ({
    activityAt: r.lastMessageAt,
    tieKey: r.roomId,
  }));
  const preview = latest
    ? resolveTradePreview({ content: latest.lastMessage, messageType: "text", isSystemAllowed: true })
    : resolveTradePreview(null);
  const unreadRoomCount = rows.filter((r) => r.unreadCount > 0).length;
  return {
    domain: TRADE_DOMAIN,
    roomCount: rows.length,
    unreadCount: unreadRoomCount,
    previewText: preview.text,
    lastEventAt: latest ? normalizeActivityAt(latest.lastMessageAt) : null,
    latestRoomId: latest?.roomId ?? null,
    latestDomainIdentityKey: latest?.domainIdentityKey ?? null,
    hrefToTradeList: TRADE_LIST_HREF,
  };
}

/** 홈 inbox 에 trade 를 Domain 으로 넣으면 계약 위반 */
export function assertHomeInboxRejectsTradeDomain(): void {
  assertDomainAllowedOnHomeInboxList(TRADE_DOMAIN);
}
