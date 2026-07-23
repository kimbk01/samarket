/**
 * trade PermissionPort — 서버 권위 계약 (route/RLS 변경 없음).
 * 판매자·거래 상대(participant)만. 친구 관계로 접근 금지.
 */
import type { MessengerPermissionPort } from "@/lib/messenger/contracts/ports";
import { assertTradeOwnedRoom, parseTradeIdentityKey } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";

export type TradePermissionContext = Readonly<{
  viewerUserId: string;
  room: {
    roomId: string;
    chatDomain: string | null | undefined;
    domainIdentityKey: string | null | undefined;
    sellerUserId: string;
    counterpartyUserId: string;
    participantUserIds: ReadonlyArray<string>;
  };
}>;

export function assertTradeViewerPermission(ctx: TradePermissionContext): void {
  const viewer = ctx.viewerUserId.trim();
  if (!viewer) throw new Error("dibay_trade_viewer_required");
  assertTradeOwnedRoom({
    roomId: ctx.room.roomId,
    chatDomain: (ctx.room.chatDomain ?? "") as "trade",
    domainIdentityKey: ctx.room.domainIdentityKey ?? "",
  });
  const parts = parseTradeIdentityKey(ctx.room.domainIdentityKey ?? "");
  if (
    parts.sellerUserId !== ctx.room.sellerUserId.trim() ||
    parts.counterpartyUserId !== ctx.room.counterpartyUserId.trim()
  ) {
    throw new Error("dibay_trade_permission_identity_parts_mismatch");
  }
  const participants = ctx.room.participantUserIds.map((id) => id.trim()).filter(Boolean);
  if (!participants.includes(viewer)) {
    throw new Error("dibay_trade_viewer_not_participant");
  }
  if (viewer !== parts.sellerUserId && viewer !== parts.counterpartyUserId) {
    throw new Error("dibay_trade_viewer_not_trade_party");
  }
}

export type TradeListApiPlan = Readonly<{
  method: "GET";
  proposedPath: "/api/messenger/trade/list";
  response: { domain: typeof TRADE_DOMAIN; generation: string; rows: "TradeListItem[]" };
  serverFilters: ReadonlyArray<string>;
}>;

export const TRADE_LIST_API_PLAN: TradeListApiPlan = {
  method: "GET",
  proposedPath: "/api/messenger/trade/list",
  response: { domain: TRADE_DOMAIN, generation: "string", rows: "TradeListItem[]" },
  serverFilters: [
    "chat_domain = trade",
    "viewer is seller or counterparty participant",
    "reject other domains",
  ],
};

export const tradePermissionPort: MessengerPermissionPort = {
  domain: TRADE_DOMAIN,
  serverAuthoritative: true,
};
