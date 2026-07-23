/**
 * Phase 8A — Badge Shell Aggregator (ViewModel contribution 합산만).
 * Domain 재판정 · DB/cache 조회 · unit 변환 · App Icon 정책 결정 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  assertShellDoesNotConvertUnreadUnits,
  type DomainAppIconContribution,
  type DomainUnreadContribution,
  type OrderStatusContribution,
  type StoreOrderUnreadContribution,
  type TradeUnreadContribution,
  type GeneralDirectUnreadContribution,
  type GroupUnreadContribution,
  PHASE8A_BADGE_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";

export type Phase8aBadgeShellInput = Readonly<{
  generalDirect: GeneralDirectUnreadContribution;
  group: GroupUnreadContribution;
  trade: TradeUnreadContribution;
  storeOrder: StoreOrderUnreadContribution;
  orderStatus: OrderStatusContribution;
}>;

export type Phase8aBadgeShellOutput = Readonly<{
  messengerNav: {
    unreadRoomCount: number;
    domains: ReadonlyArray<"general_direct" | "group">;
  };
  tradeHub: {
    unreadRoomCount: number;
    domain: "trade";
  };
  storeOrderHub: {
    unreadRoomCount: number;
    domain: "store_order";
  };
  deliveryNav: {
    orderStatusCount: number;
    storeOrderUnreadRoomCount: number;
    prefersUnionAggregator: true;
  };
  navTrade: {
    unreadRoomCount: number;
    wiredToUi: false;
  };
  appIconInputs: ReadonlyArray<DomainAppIconContribution>;
  d1_2Open: typeof D1_2_APP_ICON_UNIT_OPEN;
  shellDoesNotSetAppIcon: true;
  productionWiring: typeof PHASE8A_BADGE_PRODUCTION_WIRING;
}>;

function assertOwnDomain(
  c: DomainUnreadContribution,
  expected: ChatDomain
): void {
  if (c.domain !== expected) {
    throw new Error(`dibay_badge_shell_domain_required:${expected}:${c.domain}`);
  }
}

function toAppIconInput(c: DomainUnreadContribution): DomainAppIconContribution {
  return {
    domain: c.domain,
    viewerUserId: c.viewerUserId,
    unreadMessageCount: c.unreadMessageCount,
    unreadRoomCount: c.unreadRoomCount,
    /** Phase 8A: event count는 Domain 이 아직 제공하지 않으면 0 — 선택 로직 없음 */
    notificationEventCount: 0,
    generation: c.generation,
    d1_2UnitSelection: D1_2_APP_ICON_UNIT,
    d1_2Open: D1_2_APP_ICON_UNIT_OPEN,
  };
}

/**
 * Shell 합산 — contribution 원본 수정 없음.
 * messengerNav 에 trade/store_order 들어오면 throw.
 */
export function composePhase8aBadgeShell(input: Phase8aBadgeShellInput): Phase8aBadgeShellOutput {
  if (PHASE8A_BADGE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase8a_badge_production_wiring_must_remain_false");
  }
  assertOwnDomain(input.generalDirect, "general_direct");
  assertOwnDomain(input.group, "group");
  assertOwnDomain(input.trade, "trade");
  assertOwnDomain(input.storeOrder, "store_order");
  if (input.orderStatus.kind !== "order_status") {
    throw new Error("dibay_badge_shell_order_status_required");
  }

  // trade/store_order 가 messenger nav 로 전달되는 경로 차단
  if (
    (input.trade as DomainUnreadContribution).domain === "trade" &&
    false
  ) {
    /* noop — type-level */
  }

  return {
    messengerNav: {
      unreadRoomCount:
        Math.max(0, input.generalDirect.unreadRoomCount) +
        Math.max(0, input.group.unreadRoomCount),
      domains: ["general_direct", "group"],
    },
    tradeHub: {
      unreadRoomCount: Math.max(0, input.trade.unreadRoomCount),
      domain: "trade",
    },
    storeOrderHub: {
      unreadRoomCount: Math.max(0, input.storeOrder.unreadRoomCount),
      domain: "store_order",
    },
    deliveryNav: {
      orderStatusCount: Math.max(0, input.orderStatus.orderStatusCount),
      storeOrderUnreadRoomCount: Math.max(0, input.storeOrder.unreadRoomCount),
      /** Phase 8B: union 은 delivery-nav-aggregator-phase8b 사용 */
      prefersUnionAggregator: true as const,
    },
    navTrade: {
      unreadRoomCount: Math.max(0, input.trade.unreadRoomCount),
      wiredToUi: false,
    },
    appIconInputs: [
      toAppIconInput(input.generalDirect),
      toAppIconInput(input.group),
      toAppIconInput(input.trade),
      toAppIconInput(input.storeOrder),
    ],
    d1_2Open: D1_2_APP_ICON_UNIT_OPEN,
    shellDoesNotSetAppIcon: true,
    productionWiring: false,
  };
}

/** messengerNav 입력에 hub Domain 이 섞이면 throw */
export function assertMessengerNavRejectsHubDomains(
  contributions: ReadonlyArray<DomainUnreadContribution>
): void {
  for (const c of contributions) {
    if (c.domain === "trade" || c.domain === "store_order") {
      throw new Error(`dibay_messenger_nav_forbids_hub_domain:${c.domain}`);
    }
  }
}

/** Shell 이 unit 변환 API 를 노출하지 않음 — 호출 시 즉시 throw */
export function shellConvertUnreadMessageToRoom(_n: number): never {
  return assertShellDoesNotConvertUnreadUnits("message_to_room");
}

export function shellConvertUnreadRoomToMessage(_n: number): never {
  return assertShellDoesNotConvertUnreadUnits("room_to_message");
}

/** App Icon setter — production wiring 금지 (Phase 8B aggregator only) */
export function shellSetAppIconBadge(_n: number): never {
  throw new Error("dibay_phase8b_app_icon_setter_forbidden_until_cutover");
}
