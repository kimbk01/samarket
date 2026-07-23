/**
 * Phase 10 — Shell 최종 조합 구현.
 * inbox / hubs / messenger nav / delivery union / app icon 입력을 한 곳에서 조합.
 * Domain 내부 resolver · raw bootstrap/cache · OS Badge setter 금지.
 */
import {
  aggregateAppIconBadgeFromNotificationEvents,
  type AppIconAggregatorResult,
  type AppIconNotificationEventInput,
} from "@/lib/messenger/contracts/app-icon-aggregator-phase8b";
import { D1_2_APP_ICON_UNIT } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import {
  aggregateDeliveryNavUnion,
  type DeliveryNavUnionResult,
  type OrderStatusContributionPhase8b,
  type StoreOrderUnreadContributionPhase8b,
} from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";
import type {
  GeneralDirectUnreadContribution,
  GroupUnreadContribution,
  StoreOrderUnreadContribution,
  TradeUnreadContribution,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  assertPhase10DoesNotClaimD11RuntimePass,
  assertPhase10NoDomainReinference,
  assertPhase10ShellWiringOff,
  PHASE10_D1_1_RUNTIME_PASS_CLAIMED,
  PHASE10_SHELL_PRODUCTION_WIRING,
  PHASE10_SHELL_SURFACE_CONTRACT,
} from "@/lib/messenger/contracts/shell-final-compose-phase10";
import {
  composeMessengerShellHomeFromViewModels,
  type MessengerShellPhase45ComposedHome,
  type MessengerShellPhase45HomeInput,
} from "@/lib/messenger/shell/home-compose";

function sumMessengerNavRoomCounts(
  generalDirect: GeneralDirectUnreadContribution,
  group: GroupUnreadContribution
): number {
  if (generalDirect.domain !== "general_direct" || group.domain !== "group") {
    throw new Error("dibay_phase10_messenger_nav_domains_required");
  }
  return Math.max(0, generalDirect.unreadRoomCount) + Math.max(0, group.unreadRoomCount);
}

function toStoreOrderUnreadPhase8b(
  c: StoreOrderUnreadContribution
): StoreOrderUnreadContributionPhase8b {
  if (c.domain !== "store_order") {
    throw new Error("dibay_phase10_store_order_contribution_required");
  }
  if (c.surfaceRole !== "customer" && c.surfaceRole !== "owner") {
    throw new Error("dibay_phase10_store_order_surface_required");
  }
  return {
    domain: "store_order",
    viewerUserId: c.viewerUserId,
    surfaceRole: c.surfaceRole,
    storeId: c.storeId,
    unreadOrderIdentityKeys: c.unreadOrderIdentityKeys,
    unreadMessageCount: c.unreadMessageCount,
    unreadRoomCount: c.unreadRoomCount,
    generation: c.generation,
    computedAt: c.computedAt,
  };
}

export type Phase10ShellFinalComposeInput = Readonly<{
  /** 완성 ViewModel 만 — raw Room[] / bootstrap 금지 */
  home: MessengerShellPhase45HomeInput;
  badge: Readonly<{
    generalDirect: GeneralDirectUnreadContribution;
    group: GroupUnreadContribution;
    trade: TradeUnreadContribution;
    storeOrder: StoreOrderUnreadContribution;
    /** Delivery union 용 order-status contribution (orderId identity) */
    orderStatus: OrderStatusContributionPhase8b;
  }>;
  /** App Icon = notificationEventCount only */
  appIconNotificationEvents: ReadonlyArray<AppIconNotificationEventInput>;
  /** 재추론 시도 마커 — 있으면 fail-closed */
  reinferenceAttempt?: Readonly<{
    roomType?: string | null;
    directKey?: string | null;
    pathname?: string | null;
    contextMetaKind?: string | null;
    titleForInference?: string | null;
  }>;
}>;

export type Phase10ShellFinalComposeOutput = Readonly<{
  home: MessengerShellPhase45ComposedHome;
  messengerNavBadge: Readonly<{
    unreadRoomCount: number;
    domains: typeof PHASE10_SHELL_SURFACE_CONTRACT.messengerNavDomains;
  }>;
  tradeHubBadge: Readonly<{
    unreadRoomCount: number;
    domain: "trade";
  }>;
  storeOrderHubBadge: Readonly<{
    unreadRoomCount: number;
    domain: "store_order";
  }>;
  deliveryNavBadge: DeliveryNavUnionResult;
  appIcon: AppIconAggregatorResult;
  shellDoesNotRecomputeDisplay: true;
  shellDoesNotSetOsBadge: true;
  productionWiring: typeof PHASE10_SHELL_PRODUCTION_WIRING;
  d1_1RuntimePassClaimed: typeof PHASE10_D1_1_RUNTIME_PASS_CLAIMED;
  surfaceContract: typeof PHASE10_SHELL_SURFACE_CONTRACT;
}>;

/**
 * Shell 최종 조합 — Domain 작성/캐시/DB/OS Badge 호출 없음.
 */
export function composePhase10ShellFinal(
  input: Phase10ShellFinalComposeInput
): Phase10ShellFinalComposeOutput {
  assertPhase10ShellWiringOff();
  assertPhase10DoesNotClaimD11RuntimePass();
  if (input.reinferenceAttempt) {
    assertPhase10NoDomainReinference(input.reinferenceAttempt);
  }

  const home = composeMessengerShellHomeFromViewModels(input.home);

  // inboxRows is typed as general_direct | group only — runtime defense uses string check
  for (const entry of home.inboxRows) {
    const domain = entry.domain as string;
    if (domain !== "general_direct" && domain !== "group") {
      throw new Error(`dibay_phase10_inbox_forbids_domain:${domain}`);
    }
  }
  if (home.tradeHub.domain !== "trade") {
    throw new Error("dibay_phase10_trade_hub_required");
  }
  if (home.storeOrderHub.domain !== "store_order") {
    throw new Error("dibay_phase10_order_hub_required");
  }

  const { generalDirect, group, trade, storeOrder, orderStatus } = input.badge;
  if (generalDirect.domain !== "general_direct" || group.domain !== "group") {
    throw new Error("dibay_phase10_messenger_nav_contribution_required");
  }
  if (trade.domain !== "trade") {
    throw new Error("dibay_phase10_trade_contribution_required");
  }
  if (storeOrder.domain !== "store_order") {
    throw new Error("dibay_phase10_store_order_contribution_required");
  }
  if (orderStatus.kind !== "order_status") {
    throw new Error("dibay_phase10_order_status_contribution_required");
  }

  const messengerNavUnreadRoomCount = sumMessengerNavRoomCounts(generalDirect, group);

  const deliveryNavBadge = aggregateDeliveryNavUnion({
    orderStatus,
    storeOrderUnread: toStoreOrderUnreadPhase8b(storeOrder),
  });

  const appIcon = aggregateAppIconBadgeFromNotificationEvents(input.appIconNotificationEvents);
  if (appIcon.unit !== D1_2_APP_ICON_UNIT) {
    throw new Error("dibay_phase10_app_icon_unit_must_be_notification_event_count");
  }
  if (appIcon.setsOsBadge) {
    throw new Error("dibay_phase10_shell_must_not_set_os_badge");
  }

  return {
    home,
    messengerNavBadge: {
      unreadRoomCount: messengerNavUnreadRoomCount,
      domains: PHASE10_SHELL_SURFACE_CONTRACT.messengerNavDomains,
    },
    tradeHubBadge: {
      unreadRoomCount: Math.max(0, trade.unreadRoomCount),
      domain: "trade",
    },
    storeOrderHubBadge: {
      unreadRoomCount: Math.max(0, storeOrder.unreadRoomCount),
      domain: "store_order",
    },
    deliveryNavBadge,
    appIcon,
    shellDoesNotRecomputeDisplay: true,
    shellDoesNotSetOsBadge: true,
    productionWiring: false,
    d1_1RuntimePassClaimed: false,
    surfaceContract: PHASE10_SHELL_SURFACE_CONTRACT,
  };
}
