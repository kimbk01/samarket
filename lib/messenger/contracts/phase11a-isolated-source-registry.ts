/**
 * Phase 11A — isolated bootstrap source registry (test / harness only).
 * production routes must not register sources. persistent writer 없음.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { GeneralDirectBootstrapSource } from "@/lib/messenger/general-direct/phase6-bootstrap";
import type { GroupBootstrapSource } from "@/lib/messenger/group/phase6-bootstrap";
import type { TradeBootstrapSource } from "@/lib/messenger/trade/phase6-bootstrap";
import type {
  StoreOrderBootstrapSource,
  StoreOrderSurfaceRole,
} from "@/lib/messenger/store-order/phase6-bootstrap";

export type Phase11aIsolatedSourceKey =
  | "general_direct"
  | "group"
  | "trade"
  | "store_order_customer"
  | "store_order_owner";

type Registry = {
  general_direct: GeneralDirectBootstrapSource | null;
  group: GroupBootstrapSource | null;
  trade: TradeBootstrapSource | null;
  store_order_customer: StoreOrderBootstrapSource | null;
  store_order_owner: StoreOrderBootstrapSource | null;
};

const registry: Registry = {
  general_direct: null,
  group: null,
  trade: null,
  store_order_customer: null,
  store_order_owner: null,
};

export function registerPhase11aIsolatedBootstrapSource(
  key: Phase11aIsolatedSourceKey,
  source:
    | GeneralDirectBootstrapSource
    | GroupBootstrapSource
    | TradeBootstrapSource
    | StoreOrderBootstrapSource
): void {
  (registry as Record<string, unknown>)[key] = source;
}

export function clearPhase11aIsolatedBootstrapSources(): void {
  registry.general_direct = null;
  registry.group = null;
  registry.trade = null;
  registry.store_order_customer = null;
  registry.store_order_owner = null;
}

export function getPhase11aIsolatedGeneralDirectSource(): GeneralDirectBootstrapSource | null {
  return registry.general_direct;
}

export function getPhase11aIsolatedGroupSource(): GroupBootstrapSource | null {
  return registry.group;
}

export function getPhase11aIsolatedTradeSource(): TradeBootstrapSource | null {
  return registry.trade;
}

export function getPhase11aIsolatedStoreOrderSource(
  role: StoreOrderSurfaceRole
): StoreOrderBootstrapSource | null {
  return role === "owner" ? registry.store_order_owner : registry.store_order_customer;
}

export function storeOrderIsolatedKey(role: StoreOrderSurfaceRole): Phase11aIsolatedSourceKey {
  return role === "owner" ? "store_order_owner" : "store_order_customer";
}

export function domainToIsolatedKey(domain: ChatDomain): Phase11aIsolatedSourceKey | null {
  if (domain === "general_direct") return "general_direct";
  if (domain === "group") return "group";
  if (domain === "trade") return "trade";
  return null;
}
