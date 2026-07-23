export {
  MESSENGER_DOMAIN_BUILD_PHASE_ORDER,
  assertGroupPhaseUnlocked,
  getShellIntegrationPhaseStatus,
  type MessengerDomainBuildPhase,
} from "@/lib/messenger/contracts/phase-order";
export {
  MESSENGER_HOME_SURFACE_INVARIANTS,
  MESSENGER_HOME_INBOX_ROW_DOMAINS,
  MESSENGER_HOME_HUB_DOMAINS,
  assertDomainAllowedOnHomeInboxList,
  assertDomainIsHomeHubOnly,
} from "@/lib/messenger/contracts/home-surface";
export type { MessengerDomainPorts } from "@/lib/messenger/contracts/ports";
export {
  PHASE1_DEFAULT_CUTOVER,
  assertDomainWriterAllowed,
  assertNoDualWrite,
} from "@/lib/messenger/contracts/cutover";
export {
  MESSENGER_SHELL_NAV_BADGE_POLICY,
  assertMessengerDomainWrite,
} from "@/lib/messenger/contracts/ownership";
export {
  MESSENGER_LEGACY_BANNED_IMPORT_PATHS,
  MESSENGER_LEGACY_CATALOG,
} from "@/lib/messenger/legacy/classification";
export {
  generalDirectPorts,
  EMPTY_GENERAL_DIRECT_STATE,
  GENERAL_DIRECT_DOMAIN,
  buildGeneralDirectListSnapshot,
  acceptGeneralDirectBootstrap,
  buildGeneralDirectBadgeContribution,
} from "@/lib/messenger/general-direct";
export { groupPorts, EMPTY_GROUP_STATE, GROUP_DOMAIN, buildGroupListSnapshot, buildGroupRowModel, buildGroupBadgeContribution } from "@/lib/messenger/group";
export { tradePorts, EMPTY_TRADE_STATE, TRADE_DOMAIN, buildTradeListSnapshot, buildTradeHubViewModel, buildTradeBadgeContribution } from "@/lib/messenger/trade";
export { storeOrderPorts, EMPTY_STORE_ORDER_STATE, STORE_ORDER_DOMAIN, buildStoreOrderListSnapshot, buildStoreOrderHubViewModel, buildStoreOrderBadgeContribution } from "@/lib/messenger/store-order";
export {
  composeMessengerShellHome,
  composeMessengerShellHomeFromViewModels,
  composeMessengerInboxRows,
  composeMessengerTabBadge,
  composeDeliveryNavOrderChatContribution,
  composeTradeHubBadgeContribution,
  MESSENGER_SHELL_FORBIDS_AUTHORITATIVE_ROOM_ARRAY,
  EMPTY_GROUP_INBOX_CONTRIBUTION,
} from "@/lib/messenger/shell";
