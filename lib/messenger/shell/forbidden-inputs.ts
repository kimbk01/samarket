/**
 * Phase 4.5 — Shell 이 받을 수 있는 / 없는 입력 계약.
 * Shell 은 Domain 완성 ViewModel · Badge contribution 만 받음.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

/** Shell 공개 입력으로 허용되는 Domain public surface */
export const MESSENGER_SHELL_ALLOWED_INPUT_KINDS = [
  "general_direct_row_model",
  "group_row_model",
  "trade_hub_view_model",
  "store_order_hub_view_model",
  "domain_badge_contribution",
] as const;

/** Shell 입력이면 즉시 throw */
export const MESSENGER_SHELL_FORBIDDEN_INPUT_MARKERS = [
  "CommunityMessengerRoom",
  "contextMeta",
  "direct_key",
  "directKey",
  "roomType",
  ["unified", "Rooms"].join(""),
  "bootstrapRaw",
  "cacheEntry",
] as const;

export type ShellForbiddenPayloadKind =
  | "raw_room"
  | "raw_chats_array"
  | "raw_groups_array"
  | "context_meta"
  | "direct_key"
  | "room_type"
  | "db_row"
  | "bootstrap_raw"
  | "domain_cache_entry"
  | "trade_list_row"
  | "store_order_list_row"
  | "hub_list_row_mix";

export function assertShellRejectsForbiddenPayload(
  kind: ShellForbiddenPayloadKind,
  payload?: unknown
): never {
  void payload;
  throw new Error(`dibay_shell_forbids_input:${kind}`);
}

/** inbox row 에 trade/store_order list/chatDomain 이 있으면 FAIL */
export function assertShellInboxRowDomainAllowed(row: {
  chatDomain?: string | null;
  domain?: string | null;
}): void {
  const d = (row.chatDomain ?? row.domain ?? "").trim();
  if (d === "trade" || d === "store_order") {
    throw new Error(`dibay_shell_inbox_forbids_hub_domain_row:${d}`);
  }
  if (d && d !== "general_direct" && d !== "group") {
    throw new Error(`dibay_shell_inbox_unknown_row_domain:${d}`);
  }
}

export function assertShellInboxRowsRejectTradeAndStoreOrder(
  rows: ReadonlyArray<{ chatDomain?: string | null; domain?: string | null }>
): void {
  for (const row of rows) {
    assertShellInboxRowDomainAllowed(row);
  }
}

/** Hub VM 과 List RowModel 혼용 금지 */
export function assertShellHubIsNotListRow(hub: {
  domain: ChatDomain;
  roomId?: string | null;
  itemId?: string | null;
  orderId?: string | null;
  hrefToTradeList?: string | null;
  hrefToOrderList?: string | null;
}): void {
  if (hub.roomId?.trim() || hub.itemId?.trim() || hub.orderId?.trim()) {
    throw new Error(`dibay_shell_hub_list_row_mix_forbidden:${hub.domain}`);
  }
  if (hub.domain === "trade" && !hub.hrefToTradeList?.trim()) {
    throw new Error("dibay_shell_trade_hub_href_required");
  }
  if (hub.domain === "store_order" && !hub.hrefToOrderList?.trim()) {
    throw new Error("dibay_shell_store_order_hub_href_required");
  }
}

/** Shell 은 title/avatar/preview 를 재계산하지 않음 — pass-through 만 */
export const MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY = true as const;

export function assertShellDoesNotRecomputeDisplay(attempt: {
  recomputedTitle?: string | null;
  recomputedAvatar?: string | null;
  recomputedPreview?: string | null;
}): void {
  if (
    attempt.recomputedTitle != null ||
    attempt.recomputedAvatar != null ||
    attempt.recomputedPreview != null
  ) {
    throw new Error("dibay_shell_display_recompute_forbidden");
  }
}

/** Phase 5 — group rows 허용. 레거시 empty-only 가드 (호환) */
export const EMPTY_GROUP_INBOX_CONTRIBUTION = {
  domain: "group" as const,
  rows: [] as const,
  generation: "0",
};

/** @deprecated Phase 5 에서는 GroupRowModel[] 허용 — 빈 배열 강제 해제 */
export function assertGroupInboxEmptyUntilPhase5(rowCount: number): void {
  void rowCount;
  // Phase 5: no-op kept for import compatibility; use assertShellGroupRows instead
}

export function assertShellGroupRows(
  rows: ReadonlyArray<{ chatDomain?: string | null; domain?: string | null; groupId?: string | null }>
): void {
  for (const row of rows) {
    assertShellInboxRowDomainAllowed(row);
    const d = (row.chatDomain ?? row.domain ?? "").trim();
    if (d !== "group") {
      throw new Error(`dibay_shell_group_row_domain_required:${d || "missing"}`);
    }
  }
}

/** Shell inbox Union entry — Domain 재판정 필드 없음 */
export type MessengerShellInboxEntry =
  | {
      domain: "general_direct";
      lastMessageAt: string;
      row: {
        roomId: string;
        chatDomain: "general_direct";
        title: string;
        avatarUrl: string | null;
        previewText: string;
        unreadCount: number;
        lastMessageAt: string;
        href: string;
      };
    }
  | {
      domain: "group";
      lastMessageAt: string;
      row: {
        roomId: string;
        chatDomain: "group";
        groupId: string;
        title: string;
        avatarUrl: string | null;
        previewText: string;
        unreadCount: number;
        lastMessageAt: string;
        memberCount: number;
        href: string;
      };
    };
