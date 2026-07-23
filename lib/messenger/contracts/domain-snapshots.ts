/**
 * Phase 6 Domain Bootstrap Snapshot 타입 별칭.
 * 통합 CommunityMessengerBootstrap.chats/groups 재사용 금지.
 */
import type { DomainBootstrapApiResponse } from "@/lib/messenger/contracts/bootstrap-api-response";
import type { GeneralDirectListItem } from "@/lib/messenger/general-direct/types";
import type { GroupListItem } from "@/lib/messenger/group/types";
import type { TradeListItem } from "@/lib/messenger/trade/types";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type { TradeBootstrapHub } from "@/lib/messenger/trade/phase6-bootstrap";
import type { StoreOrderBootstrapHub } from "@/lib/messenger/store-order/phase6-bootstrap";

export type GeneralDirectSnapshot = DomainBootstrapApiResponse<GeneralDirectListItem, null>;
export type GroupSnapshot = DomainBootstrapApiResponse<GroupListItem, null>;
export type TradeSnapshot = DomainBootstrapApiResponse<TradeListItem, TradeBootstrapHub>;
export type StoreOrderSnapshot = DomainBootstrapApiResponse<StoreOrderListItem, StoreOrderBootstrapHub>;
