/**
 * Messenger Shell — Domain 완성 ViewModel / Badge 조합만 (Phase 4.5).
 * 원본 Room 배열 import·합치기 금지. Domain 재판정·cache clear·display 재계산 금지.
 * Domain 내부 resolver(header / preview / …) 직접 import 금지 — public index type 만.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  MESSENGER_SHELL_NAV_BADGE_POLICY,
  sumMessengerShellBadgeContributions,
  type MessengerShellBadgeContribution,
  type MessengerShellListSlice,
} from "@/lib/messenger/contracts/ownership";
import {
  assertDomainAllowedOnHomeInboxList,
  assertDomainIsHomeHubOnly,
  MESSENGER_HOME_SURFACE_INVARIANTS,
} from "@/lib/messenger/contracts/home-surface";
import type { GroupRowModel } from "@/lib/messenger/group";
import type { TradeHubViewModel } from "@/lib/messenger/trade";
import type { StoreOrderHubViewModel } from "@/lib/messenger/store-order";
import type { GeneralDirectRowModel } from "@/lib/messenger/general-direct";
import {
  composeMessengerShellHomeFromViewModels,
  composeMessengerInboxRows,
  type MessengerShellPhase45ComposedHome,
  type MessengerShellPhase45HomeInput,
} from "@/lib/messenger/shell/home-compose";
import {
  assertShellRejectsForbiddenPayload,
  assertShellInboxRowsRejectTradeAndStoreOrder,
  assertShellGroupRows,
  EMPTY_GROUP_INBOX_CONTRIBUTION,
  MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY,
  MESSENGER_SHELL_FORBIDDEN_INPUT_MARKERS,
  MESSENGER_SHELL_ALLOWED_INPUT_KINDS,
  type MessengerShellInboxEntry,
} from "@/lib/messenger/shell/forbidden-inputs";

export {
  MESSENGER_SHELL_NAV_BADGE_POLICY,
  sumMessengerShellBadgeContributions,
  type MessengerShellBadgeContribution,
  type MessengerShellListSlice,
};

export {
  assertDomainAllowedOnHomeInboxList,
  assertDomainIsHomeHubOnly,
  MESSENGER_HOME_SURFACE_INVARIANTS,
  MESSENGER_HOME_INBOX_ROW_DOMAINS,
  MESSENGER_HOME_HUB_DOMAINS,
} from "@/lib/messenger/contracts/home-surface";

export {
  composeMessengerShellHomeFromViewModels,
  composeMessengerInboxRows,
  type MessengerShellPhase45ComposedHome,
  type MessengerShellPhase45HomeInput,
};

export {
  assertShellRejectsForbiddenPayload,
  assertShellInboxRowsRejectTradeAndStoreOrder,
  assertShellDoesNotRecomputeDisplay,
  assertShellHubIsNotListRow,
  assertShellGroupRows,
  assertGroupInboxEmptyUntilPhase5,
  EMPTY_GROUP_INBOX_CONTRIBUTION,
  MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY,
  MESSENGER_SHELL_FORBIDDEN_INPUT_MARKERS,
  MESSENGER_SHELL_ALLOWED_INPUT_KINDS,
  type MessengerShellInboxEntry,
} from "@/lib/messenger/shell/forbidden-inputs";

/** Shell 이 Domain 원본 Room[] 를 권위로 쓰지 않는다는 마커 */
export const MESSENGER_SHELL_FORBIDS_AUTHORITATIVE_ROOM_ARRAY = true as const;

/**
 * @deprecated Phase 4.5 — composeMessengerShellHomeFromViewModels 사용.
 * 하위 호환: count 기반 hub 입력을 ViewModel-ish 로 승격하지 않음.
 * Phase 1 테스트용 thin wrapper 는 ViewModel 경로로 위임.
 */
export type MessengerShellHomeComposeInput = MessengerShellPhase45HomeInput;

export type MessengerShellComposedHome = MessengerShellPhase45ComposedHome;

/** 순수 조합 — Domain state 수정 없음 · Hub VM + general_direct rows 만 */
export function composeMessengerShellHome(
  input: MessengerShellPhase45HomeInput
): MessengerShellPhase45ComposedHome {
  return composeMessengerShellHomeFromViewModels(input);
}

export function composeMessengerTabBadge(
  general: MessengerShellBadgeContribution,
  group: MessengerShellBadgeContribution
): number {
  if (general.domain !== "general_direct" || group.domain !== "group") {
    throw new Error("dibay_shell_messenger_tab_domains_required");
  }
  return sumMessengerShellBadgeContributions([general, group]);
}

/** trade/store_order 는 messenger tab 에 올리면 거부 */
export function assertMessengerTabExcludesTradeAndStoreOrder(
  contributions: ReadonlyArray<MessengerShellBadgeContribution>
): void {
  for (const c of contributions) {
    if (c.domain === "trade" || c.domain === "store_order") {
      throw new Error(`dibay_shell_messenger_tab_forbids_domain:${c.domain}`);
    }
  }
}

export function composeDeliveryNavOrderChatContribution(
  storeOrder: MessengerShellBadgeContribution
): number {
  if (storeOrder.domain !== MESSENGER_SHELL_NAV_BADGE_POLICY.deliveryNavStoreOrderContribution) {
    throw new Error("dibay_shell_delivery_nav_store_order_required");
  }
  return Math.max(0, Math.floor(storeOrder.count));
}

export function composeTradeHubBadgeContribution(trade: MessengerShellBadgeContribution): number {
  if (trade.domain !== MESSENGER_SHELL_NAV_BADGE_POLICY.tradeHubDomain) {
    throw new Error("dibay_shell_trade_hub_badge_required");
  }
  return Math.max(0, Math.floor(trade.count));
}

export function assertShellDoesNotOwnDomain(domain: ChatDomain, capability: string): never {
  throw new Error(`dibay_shell_cannot_own_domain:${domain}:${capability}`);
}

export {
  composePhase8aBadgeShell,
  assertMessengerNavRejectsHubDomains,
  shellConvertUnreadMessageToRoom,
  shellConvertUnreadRoomToMessage,
  shellSetAppIconBadge,
  type Phase8aBadgeShellInput,
  type Phase8aBadgeShellOutput,
} from "@/lib/messenger/contracts/badge-shell-phase8a";

export {
  aggregateAppIconBadgeFromNotificationEvents,
  markEventsReadForRoom,
} from "@/lib/messenger/contracts/app-icon-aggregator-phase8b";

export {
  aggregateDeliveryNavUnion,
  deliveryNavArithmeticSum,
  type OrderStatusContributionPhase8b,
  type StoreOrderUnreadContributionPhase8b,
  type DeliveryNavUnionResult,
} from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";

export {
  PHASE8B_BADGE_UNIT_POLICY,
  D1_2_APP_ICON_UNIT,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";

export {
  parseMessengerNotificationEnvelope,
  PHASE9_NOTIFICATION_PRODUCTION_WIRING,
  MESSENGER_NOTIFICATION_SCHEMA_VERSION,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";

export {
  resolvePhase9DomainSoundKey,
  PHASE9_DOMAIN_SOUND_KEYS,
} from "@/lib/messenger/contracts/domain-sound-key-phase9";

export {
  adaptNotificationEventsToAppIconContribution,
  envelopesToUnreadBadgeEvents,
} from "@/lib/messenger/contracts/notification-app-icon-adapter-phase9";

export {
  PHASE10_SHELL_PRODUCTION_WIRING,
  PHASE10_D1_1_RUNTIME_PASS_CLAIMED,
  PHASE10_SHELL_SURFACE_CONTRACT,
  assertPhase10RejectsForbiddenInput,
  assertPhase10NoDomainReinference,
} from "@/lib/messenger/contracts/shell-final-compose-phase10";

export {
  composePhase10ShellFinal,
  type Phase10ShellFinalComposeInput,
  type Phase10ShellFinalComposeOutput,
} from "@/lib/messenger/shell/phase10-final-compose";

/** shell 모듈이 Domain 내부 경로를 import 하면 architecture fail 용 목록 */
export const MESSENGER_SHELL_FORBIDDEN_DOMAIN_INTERNAL_IMPORT_SUFFIXES = [
  "/header",
  "/preview",
  "/presentation",
  "/notification-sound",
  "/phase9-notification",
  "/read-unread-badge",
  "/customer-presentation-resolver",
  "/owner-presentation-resolver",
  "/cache",
  "/bootstrap",
] as const;

export type { GeneralDirectRowModel, TradeHubViewModel, StoreOrderHubViewModel, GroupRowModel };
