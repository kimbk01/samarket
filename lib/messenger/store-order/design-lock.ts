/**
 * store_order Domain — DESIGN LOCK + Phase 4 조건부 승인 경계.
 *
 * 목표: Trade 와 완전히 다른 독립 Domain. 기존 UI 빠른 수정이 아님.
 * UI cutover / runtime wiring 금지 — Ports → Unit → Contract → Shell → Wiring 순서.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type {
  StoreOrderCustomerSurface,
} from "@/lib/messenger/store-order/customer-surface";
import type { StoreOrderOwnerSurface } from "@/lib/messenger/store-order/owner-surface";

export const STORE_ORDER_DOMAIN = "store_order" as const;

/** Identity: store_order:{orderId} — 매장 단위 병합 금지 */
export const STORE_ORDER_IDENTITY_PREFIX = "store_order:" as const;

export const STORE_ORDER_DESIGN_LOCK = [
  "forbids_trade_inheritance_and_trade_module_import",
  "identity_is_store_order_orderId_only",
  "same_store_different_order_separate_rooms_and_rows",
  "customer_and_owner_surfaces_are_separate_contracts",
  "customer_display_is_store_name_and_store_image",
  "owner_display_is_customer_name_and_customer_avatar",
  "forbids_shared_surface_resolver_header_presentation",
  "forbids_customer_peer_user_fallback",
  "preview_is_latest_order_chat_message_only",
  "forbids_order_number_summary_status_headline_as_preview",
  "badge_hub_list_delivery_app_icon_only",
  "nav_messenger_contribution_is_zero",
  "forbids_trade_general_group_header_preview_badge_notification",
  "requires_dual_presentation_ports_in_phase4",
  "forbids_copying_or_renaming_trade_ports",
  "forbids_ui_cutover_in_phase4",
] as const;

/** Phase 4 조건부 승인 — 위반 시 구현 중단 */
export const STORE_ORDER_PHASE4_APPROVAL_CONDITIONS = [
  "no_trade_port_copy_or_rename",
  "customer_owner_pipelines_fully_separate",
  "preview_only_via_store_order_preview_port",
  "headers_are_customer_or_owner_only",
  "hub_list_room_independent_of_messenger_inbox",
  "badge_only_via_store_order_badge_port",
  "notification_only_via_store_order_notification_port",
  "invariant_test_required",
  "no_runtime_wiring_or_cutover",
] as const;

/** StoreOrderInvariantTest 필수 10항 */
export const STORE_ORDER_INVARIANT_IDS = [
  "customer_ui_member_name_is_fail",
  "customer_ui_member_avatar_is_fail",
  "customer_header_general_is_fail",
  "preview_order_summary_is_fail",
  "preview_order_number_is_fail",
  "preview_status_text_is_fail",
  "missing_store_image_peer_avatar_is_fail",
  "badge_into_messenger_nav_is_fail",
  "trade_port_import_is_fail",
  "general_port_import_is_fail",
] as const;

export const STORE_ORDER_REQUIRES_DUAL_PRESENTATION_PORTS = true as const;

export const STORE_ORDER_FORBIDDEN_MODULE_IMPORTS = [
  "trade",
  "general-direct",
  "group",
] as const;

export const STORE_ORDER_FORBIDDEN_TRADE_PORT_TOKENS = [
  "buildTrade",
  "TradePresentation",
  "TradeHeaderPort",
  "TradePreview",
  "TradeRowModel",
  "TradeHubViewModel",
  "TradeListViewModel",
  "tradePorts",
  "mapTradeListItem",
  "resolveTradePreview",
  "resolveTradeHeader",
] as const;

export const STORE_ORDER_BADGE_CONTRIBUTES_TO = ["hub", "nav_delivery", "app_icon"] as const;
export type StoreOrderBadgeContributionTarget = (typeof STORE_ORDER_BADGE_CONTRIBUTES_TO)[number];
export const STORE_ORDER_NAV_MESSENGER_CONTRIBUTION = 0 as const;

const IDENTITY_RE = /^store_order:([^:]+)$/;

export function assertStoreOrderIdentityKey(identityKey: string): { orderId: string } {
  const key = identityKey.trim();
  if (key.startsWith("trade:") || key.startsWith("general_direct:") || key.startsWith("group:")) {
    throw new Error("dibay_store_order_foreign_identity_forbidden");
  }
  const m = IDENTITY_RE.exec(key);
  if (!m) throw new Error("dibay_store_order_identity_prefix_mismatch");
  const orderId = m[1]!.trim();
  if (!orderId) throw new Error("dibay_store_order_order_id_required");
  return { orderId };
}

export function buildStoreOrderIdentityKey(orderId: string): string {
  const id = orderId.trim();
  if (!id) throw new Error("dibay_store_order_order_id_required");
  return `${STORE_ORDER_IDENTITY_PREFIX}${id}`;
}

export function assertDistinctOrdersSeparateIdentity(orderA: string, orderB: string): void {
  const a = buildStoreOrderIdentityKey(orderA);
  const b = buildStoreOrderIdentityKey(orderB);
  if (a === b) throw new Error("dibay_store_order_orders_must_not_collapse");
}

export function assertStoreOrderDomainOnly(chatDomain: string, capability: string): void {
  if (chatDomain !== STORE_ORDER_DOMAIN) {
    throw new Error(`dibay_store_order_${capability}_rejects:${chatDomain}`);
  }
}

export function assertStoreOrderHeaderOwnDomainOnly(chatDomain: string): void {
  assertStoreOrderDomainOnly(chatDomain, "header");
}

export function assertStoreOrderPreviewOwnDomainOnly(chatDomain: string): void {
  assertStoreOrderDomainOnly(chatDomain, "preview");
}

export function assertStoreOrderNotificationOwnDomainOnly(chatDomain: string): void {
  assertStoreOrderDomainOnly(chatDomain, "notification");
}

/**
 * Design-lock (intentional): list/hub preview must not expose order-summary templates
 * (`forbids_order_number_summary_status_headline_as_preview`, invariant preview_order_summary_is_fail).
 * Runtime: `resolveStoreOrderPreview` redacts these to a safe fallback (does not throw for content markers).
 * Hard throw remains for metadata-field mix / bare status text.
 */
export const STORE_ORDER_PREVIEW_FORBIDDEN_MARKERS = [
  "주문 요약",
  "📋 주문 요약",
  "주문번호",
  "주문 번호",
  "주문상태",
  "주문 상태",
] as const;

export function contentHitsStoreOrderPreviewForbiddenMarkers(content: string): boolean {
  const c = content.trim();
  if (!c) return false;
  for (const marker of STORE_ORDER_PREVIEW_FORBIDDEN_MARKERS) {
    if (c.includes(marker)) return true;
  }
  return false;
}

export function assertStoreOrderPreviewDoesNotUseMetadata(input: {
  content?: string | null;
  orderNumberAsPreview?: string | null;
  orderSummaryAsPreview?: string | null;
  orderStatusAsPreview?: string | null;
  metadataHeadlineAsPreview?: string | null;
  lastMessageFieldAsPreview?: string | null;
  headlineFieldAsPreview?: string | null;
  summaryFieldAsPreview?: string | null;
}): void {
  if (
    input.orderNumberAsPreview?.trim() ||
    input.orderSummaryAsPreview?.trim() ||
    input.orderStatusAsPreview?.trim() ||
    input.metadataHeadlineAsPreview?.trim() ||
    input.lastMessageFieldAsPreview?.trim() ||
    input.headlineFieldAsPreview?.trim() ||
    input.summaryFieldAsPreview?.trim()
  ) {
    throw new Error("dibay_store_order_preview_metadata_forbidden");
  }
  // Content markers: callers that still assert hard (tests / legacy) may pass content.
  // Prefer resolveStoreOrderPreview row-level redact in product paths.
  const content = (input.content ?? "").trim();
  if (contentHitsStoreOrderPreviewForbiddenMarkers(content)) {
    throw new Error("dibay_store_order_preview_summary_forbidden");
  }
}

export function assertStoreOrderBadgeContributionTargets(
  contributesTo: ReadonlyArray<string>
): void {
  for (const t of contributesTo) {
    if (t === "nav_messenger") {
      throw new Error("dibay_store_order_nav_messenger_contribution_forbidden");
    }
    if (!(STORE_ORDER_BADGE_CONTRIBUTES_TO as readonly string[]).includes(t)) {
      throw new Error(`dibay_store_order_badge_target_forbidden:${t}`);
    }
  }
}

export function assertStoreOrderCustomerSurface(
  surface: StoreOrderCustomerSurface | StoreOrderOwnerSurface
): asserts surface is StoreOrderCustomerSurface {
  if (surface.kind !== "buyer_store") {
    throw new Error("dibay_store_order_customer_surface_required");
  }
}

export function assertStoreOrderOwnerSurface(
  surface: StoreOrderCustomerSurface | StoreOrderOwnerSurface
): asserts surface is StoreOrderOwnerSurface {
  if (surface.kind !== "owner_buyer_peer") {
    throw new Error("dibay_store_order_owner_surface_required");
  }
}

export function assertStoreOrderDoesNotReuseForeignDomainModules(importedPath: string): void {
  const p = importedPath.replace(/\\/g, "/");
  const segments = p.split("/").filter(Boolean);
  const messengerIdx = segments.indexOf("messenger");
  if (messengerIdx < 0 || messengerIdx + 1 >= segments.length) return;
  const domainDir = segments[messengerIdx + 1]!;
  if (domainDir === "trade" || domainDir === "general-direct" || domainDir === "group") {
    throw new Error(`dibay_store_order_foreign_domain_module_forbidden:${importedPath}`);
  }
}

export function assertForeignDomainRejectedByStoreOrderCapability(
  foreignDomain: ChatDomain,
  capability: "header" | "preview" | "notification" | "badge"
): void {
  if (foreignDomain === STORE_ORDER_DOMAIN) {
    throw new Error("dibay_store_order_assert_requires_foreign_domain");
  }
  assertStoreOrderDomainOnly(foreignDomain, capability);
}
