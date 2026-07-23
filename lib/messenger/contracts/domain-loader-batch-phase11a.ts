/**
 * Phase 11A — Domain Loader batch client + query budget SSOT.
 * N+1 금지. 통합 mega bootstrap / legacy process cache 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type DomainLoaderQueryBudget = Readonly<{
  domain: ChatDomain;
  /** fixed batch round-trips (not per-room) */
  dbQueryCount: number;
  usesRpc: boolean;
  batchSelect: true;
  nPlusOne: false;
  maxRowsDefault: number;
  pagination: "cursor_planned_not_wired" | "none";
  payloadNotes: string;
}>;

export const PHASE11A_LOADER_QUERY_BUDGETS: Readonly<Record<string, DomainLoaderQueryBudget>> = {
  general_direct: {
    domain: "general_direct",
    dbQueryCount: 3,
    usesRpc: false,
    batchSelect: true,
    nPlusOne: false,
    maxRowsDefault: 200,
    pagination: "cursor_planned_not_wired",
    payloadNotes:
      "Q1 rooms∩participants · Q2 latest messages by room_ids · Q3 peer profiles by user_ids",
  },
  group: {
    domain: "group",
    dbQueryCount: 3,
    usesRpc: false,
    batchSelect: true,
    nPlusOne: false,
    maxRowsDefault: 200,
    pagination: "cursor_planned_not_wired",
    payloadNotes:
      "Q1 group rooms∩membership · Q2 latest messages · Q3 group profile fields (no peer fallback)",
  },
  trade: {
    domain: "trade",
    dbQueryCount: 3,
    usesRpc: false,
    batchSelect: true,
    nPlusOne: false,
    maxRowsDefault: 200,
    pagination: "cursor_planned_not_wired",
    payloadNotes:
      "Q1 trade rooms∩viewer · Q2 latest chat messages · Q3 item+peer batch (no product_chat merge)",
  },
  store_order_customer: {
    domain: "store_order",
    dbQueryCount: 3,
    usesRpc: false,
    batchSelect: true,
    nPlusOne: false,
    maxRowsDefault: 200,
    pagination: "cursor_planned_not_wired",
    payloadNotes: "Q1 orders where buyer=viewer · Q2 latest chat · Q3 stores batch (no owner avatar)",
  },
  store_order_owner: {
    domain: "store_order",
    dbQueryCount: 3,
    usesRpc: false,
    batchSelect: true,
    nPlusOne: false,
    maxRowsDefault: 200,
    pagination: "cursor_planned_not_wired",
    payloadNotes:
      "Q1 orders for owner storeId · Q2 latest chat · Q3 customer profiles (no customer surface mix)",
  },
} as const;

/** Latest message must come from messages table — never room.last_message summary */
export type DomainLoaderLatestMessageRow = Readonly<{
  roomId: string;
  bodyText: string | null;
  isSystem: boolean;
  createdAt: string;
}>;

export type DomainLoaderRoomSeedRow = Readonly<{
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  unreadCount: number;
  /** forbidden as preview authority */
  roomLastMessageSummary?: string | null;
  roomTitle?: string | null;
}>;

export function pickAuthoritativeMessagePreview(input: {
  latestMessage: DomainLoaderLatestMessageRow | null;
  roomLastMessageSummary?: string | null;
  roomTitle?: string | null;
  orderStatusLabel?: string | null;
  productSummary?: string | null;
}): string {
  void input.roomLastMessageSummary;
  void input.roomTitle;
  void input.orderStatusLabel;
  void input.productSummary;
  // summary/title/status explicitly ignored — fail closed to message source only
  if (!input.latestMessage) return "";
  return (input.latestMessage.bodyText ?? "").trim();
}

export function assertNoDuplicateDomainIdentity(
  rows: ReadonlyArray<{ domainIdentityKey: string; roomId: string }>,
  domain: ChatDomain
): void {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const key = row.domainIdentityKey.trim();
    const prev = seen.get(key);
    if (prev && prev !== row.roomId) {
      throw new Error(`dibay_loader_duplicate_identity:${domain}:${key}`);
    }
    seen.set(key, row.roomId);
  }
}
