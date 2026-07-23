/**
 * Phase 9 — store_order Notification Port.
 * customer / owner cache·resolver 완전 분리. production wiring 금지.
 */
import {
  assertEnvelopeViewer,
  parseMessengerNotificationEnvelope,
  type StoreOrderDisplayContext,
  type StoreOrderSurfaceRole,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { assertSoundKeyMatchesEnvelope } from "@/lib/messenger/contracts/domain-sound-key-phase9";
import { assertStoreOrderIdentityMatchesOrderId } from "@/lib/messenger/store-order/identity";
import { resolveStoreOrderNotificationDisplay } from "@/lib/messenger/store-order/notification-sound";
import {
  STORE_ORDER_DOMAIN,
} from "@/lib/messenger/store-order/design-lock";
import {
  STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
  STORE_ORDER_STORE_NAME_PLACEHOLDER,
} from "@/lib/messenger/store-order/types";

/** 매장 이미지 없을 때 avatar fallback — owner 개인 avatar 금지 */
export const STORE_ORDER_STORE_IMAGE_PLACEHOLDER = "store_placeholder" as const;

export type StoreOrderResolvedNotification = Readonly<{
  domain: typeof STORE_ORDER_DOMAIN;
  surfaceRole: StoreOrderSurfaceRole;
  orderId: string;
  storeId: string;
  title: string;
  avatarUrl: string | null;
  avatarPlaceholder: typeof STORE_ORDER_STORE_IMAGE_PLACEHOLDER | null;
  preview: string;
  eventId: string;
  soundKey: string;
  setsOsBadge: false;
}>;

function assertPreviewNotOverriddenByOrderMeta(ctx: StoreOrderDisplayContext): void {
  if (
    (ctx.orderSummary?.trim() || ctx.orderStatusLabel?.trim()) &&
    !ctx.messagePreview.trim()
  ) {
    throw new Error("dibay_store_order_notification_preview_must_be_message");
  }
}

export function applyStoreOrderNotificationEnvelope(
  raw: unknown,
  opts: { viewerUserId: string; expectedSurfaceRole: StoreOrderSurfaceRole }
): StoreOrderResolvedNotification {
  const envelope = parseMessengerNotificationEnvelope(raw);
  if (envelope.chatDomain !== STORE_ORDER_DOMAIN) {
    throw new Error(`dibay_store_order_notification_rejects:${envelope.chatDomain}`);
  }
  assertEnvelopeViewer(envelope, opts.viewerUserId);
  const ctx = envelope.displayContext as StoreOrderDisplayContext;
  if (ctx.surfaceRole !== opts.expectedSurfaceRole) {
    throw new Error("dibay_store_order_notification_surface_role_mismatch");
  }
  assertSoundKeyMatchesEnvelope(STORE_ORDER_DOMAIN, envelope.soundKey, ctx.surfaceRole);
  assertStoreOrderIdentityMatchesOrderId(envelope.domainIdentityKey, ctx.orderId);
  assertPreviewNotOverriddenByOrderMeta(ctx);

  if (ctx.surfaceRole === "customer") {
    if (ctx.ownerMemberName?.trim() || ctx.ownerMemberAvatarUrl?.trim()) {
      throw new Error("dibay_store_order_customer_owner_member_identity_forbidden");
    }
    // customer surface 에 회원(customerName as owner leak) 혼입도 기존 규칙으로 차단
    const display = resolveStoreOrderNotificationDisplay({
      chatDomain: envelope.chatDomain,
      domainIdentityKey: envelope.domainIdentityKey,
      roomId: envelope.roomId,
      eventId: envelope.eventId,
      viewerRole: "customer",
      storeName: ctx.storeName,
      storeImageUrl: ctx.storeImageUrl,
      customerName: null,
      customerAvatarUrl: null,
      messagePreview: ctx.messagePreview,
    });
    const hasStoreImage = Boolean(ctx.storeImageUrl?.trim());
    return {
      domain: STORE_ORDER_DOMAIN,
      surfaceRole: "customer",
      orderId: ctx.orderId,
      storeId: ctx.storeId,
      title: display.title || STORE_ORDER_STORE_NAME_PLACEHOLDER,
      avatarUrl: hasStoreImage ? display.avatarUrl : null,
      avatarPlaceholder: hasStoreImage ? null : STORE_ORDER_STORE_IMAGE_PLACEHOLDER,
      preview: display.preview,
      eventId: envelope.eventId,
      soundKey: envelope.soundKey,
      setsOsBadge: false,
    };
  }

  const display = resolveStoreOrderNotificationDisplay({
    chatDomain: envelope.chatDomain,
    domainIdentityKey: envelope.domainIdentityKey,
    roomId: envelope.roomId,
    eventId: envelope.eventId,
    viewerRole: "owner",
    storeName: null,
    storeImageUrl: null,
    customerName: ctx.customerName,
    customerAvatarUrl: ctx.customerAvatarUrl,
    messagePreview: ctx.messagePreview,
  });
  return {
    domain: STORE_ORDER_DOMAIN,
    surfaceRole: "owner",
    orderId: ctx.orderId,
    storeId: ctx.storeId,
    title: display.title || STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
    avatarUrl: display.avatarUrl,
    avatarPlaceholder: null,
    preview: display.preview,
    eventId: envelope.eventId,
    soundKey: envelope.soundKey,
    setsOsBadge: false,
  };
}

/**
 * customer / owner cache 완전 분리.
 * 동일 event 를 양쪽에 적용하면 FAIL.
 */
export class StoreOrderNotificationCacheHarness {
  private readonly customer = new Map<string, StoreOrderResolvedNotification>();
  private readonly owner = new Map<string, StoreOrderResolvedNotification>();
  private readonly claimedEventSurfaces = new Map<string, StoreOrderSurfaceRole>();

  apply(
    raw: unknown,
    viewerUserId: string,
    surfaceRole: StoreOrderSurfaceRole
  ): { applied: boolean; size: number } {
    const eventIdProbe = (raw as { eventId?: string })?.eventId?.trim();
    if (eventIdProbe) {
      const claimed = this.claimedEventSurfaces.get(eventIdProbe);
      if (claimed && claimed !== surfaceRole) {
        throw new Error("dibay_store_order_notification_cross_surface_cache_forbidden");
      }
    }
    const resolved = applyStoreOrderNotificationEnvelope(raw, {
      viewerUserId,
      expectedSurfaceRole: surfaceRole,
    });
    const bag = surfaceRole === "customer" ? this.customer : this.owner;
    if (bag.has(resolved.eventId)) {
      return { applied: false, size: bag.size };
    }
    const other = surfaceRole === "customer" ? this.owner : this.customer;
    if (other.has(resolved.eventId)) {
      throw new Error("dibay_store_order_notification_cross_surface_cache_forbidden");
    }
    bag.set(resolved.eventId, resolved);
    this.claimedEventSurfaces.set(resolved.eventId, surfaceRole);
    return { applied: true, size: bag.size };
  }

  size(surfaceRole: StoreOrderSurfaceRole): number {
    return (surfaceRole === "customer" ? this.customer : this.owner).size;
  }
}
