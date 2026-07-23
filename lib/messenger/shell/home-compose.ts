/**
 * Phase 4.5+5 — Shell 홈 조합 (Domain 완성 ViewModel 만).
 * inbox = general_direct + group RowModel. Hub = trade + store_order.
 * Shell → Domain 내부 resolver import 금지.
 */
import type { GeneralDirectRowModel } from "@/lib/messenger/general-direct";
import type { GroupRowModel } from "@/lib/messenger/group";
import type { TradeHubViewModel } from "@/lib/messenger/trade";
import type { StoreOrderHubViewModel } from "@/lib/messenger/store-order";
import {
  assertDomainAllowedOnHomeInboxList,
  assertDomainIsHomeHubOnly,
} from "@/lib/messenger/contracts/home-surface";
import {
  assertShellDoesNotRecomputeDisplay,
  assertShellGroupRows,
  assertShellHubIsNotListRow,
  assertShellInboxRowsRejectTradeAndStoreOrder,
  EMPTY_GROUP_INBOX_CONTRIBUTION,
  MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY,
  type MessengerShellInboxEntry,
} from "@/lib/messenger/shell/forbidden-inputs";

export type MessengerShellPhase45HomeInput = Readonly<{
  generalDirectRows: ReadonlyArray<GeneralDirectRowModel>;
  /** Phase 5 — GroupRowModel[]. 비어 있어도 됨 */
  groupRows?: ReadonlyArray<GroupRowModel>;
  tradeHub: TradeHubViewModel;
  storeOrderHub: StoreOrderHubViewModel;
}>;

export type MessengerShellPhase45ComposedHome = Readonly<{
  generalDirectRows: ReadonlyArray<GeneralDirectRowModel>;
  groupRows: ReadonlyArray<GroupRowModel>;
  /** Domain 재판정 없이 lastMessageAt 만으로 최신순 정렬된 inbox */
  inboxRows: ReadonlyArray<MessengerShellInboxEntry>;
  groupContribution: {
    domain: "group";
    rows: ReadonlyArray<GroupRowModel>;
    generation: string;
  };
  tradeHub: TradeHubViewModel;
  storeOrderHub: StoreOrderHubViewModel;
  shellDoesNotRecomputeDisplay: typeof MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY;
}>;

/** 완성 RowModel 만 시간순 병합 — Domain 재판정 금지 */
export function composeMessengerInboxRows(
  generalDirectRows: ReadonlyArray<GeneralDirectRowModel>,
  groupRows: ReadonlyArray<GroupRowModel>
): ReadonlyArray<MessengerShellInboxEntry> {
  assertShellInboxRowsRejectTradeAndStoreOrder(generalDirectRows);
  assertShellGroupRows(groupRows);
  for (const row of generalDirectRows) {
    if (row.chatDomain !== "general_direct") {
      throw new Error(`dibay_shell_general_row_domain_required:${row.chatDomain}`);
    }
  }
  const entries: MessengerShellInboxEntry[] = [
    ...generalDirectRows.map(
      (row): MessengerShellInboxEntry => ({
        domain: "general_direct",
        lastMessageAt: row.lastMessageAt,
        row,
      })
    ),
    ...groupRows.map(
      (row): MessengerShellInboxEntry => ({
        domain: "group",
        lastMessageAt: row.lastMessageAt,
        row,
      })
    ),
  ];
  return entries.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function composeMessengerShellHomeFromViewModels(
  input: MessengerShellPhase45HomeInput
): MessengerShellPhase45ComposedHome {
  assertDomainAllowedOnHomeInboxList("general_direct");
  assertShellInboxRowsRejectTradeAndStoreOrder(input.generalDirectRows);
  for (const row of input.generalDirectRows) {
    if (row.chatDomain !== "general_direct") {
      throw new Error(`dibay_shell_general_row_domain_required:${row.chatDomain}`);
    }
  }

  const groupRows = input.groupRows ?? [];
  assertDomainAllowedOnHomeInboxList("group");
  assertShellGroupRows(groupRows);

  assertDomainIsHomeHubOnly(input.tradeHub.domain);
  assertDomainIsHomeHubOnly(input.storeOrderHub.domain);
  if (input.tradeHub.domain !== "trade") {
    throw new Error("dibay_shell_trade_hub_domain_required");
  }
  if (input.storeOrderHub.domain !== "store_order") {
    throw new Error("dibay_shell_store_order_hub_domain_required");
  }
  assertShellHubIsNotListRow(input.tradeHub);
  assertShellHubIsNotListRow(input.storeOrderHub);
  assertShellDoesNotRecomputeDisplay({});

  const inboxRows = composeMessengerInboxRows(input.generalDirectRows, groupRows);

  return {
    generalDirectRows: input.generalDirectRows,
    groupRows,
    inboxRows,
    groupContribution: {
      domain: "group",
      rows: groupRows,
      generation: EMPTY_GROUP_INBOX_CONTRIBUTION.generation,
    },
    tradeHub: input.tradeHub,
    storeOrderHub: input.storeOrderHub,
    shellDoesNotRecomputeDisplay: MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY,
  };
}
