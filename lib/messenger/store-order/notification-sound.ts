/**
 * StoreOrderNotificationPort + Sound — trade/general notification 재사용 금지.
 */
import type { MessengerNotificationPort, MessengerSoundPort } from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom } from "@/lib/messenger/store-order/identity";
import {
  STORE_ORDER_DOMAIN,
} from "@/lib/messenger/store-order/design-lock";
import {
  STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
  STORE_ORDER_STORE_NAME_PLACEHOLDER,
} from "@/lib/messenger/store-order/types";

export type StoreOrderNotificationViewerRole = "customer" | "owner";

export type StoreOrderNotificationDisplayInput = Readonly<{
  chatDomain: string;
  domainIdentityKey: string;
  roomId: string;
  eventId: string;
  viewerRole: StoreOrderNotificationViewerRole;
  storeName: string | null | undefined;
  storeImageUrl: string | null | undefined;
  customerName: string | null | undefined;
  customerAvatarUrl: string | null | undefined;
  messagePreview: string | null | undefined;
  roomType?: string | null;
  directKey?: string | null;
  pathname?: string | null;
  titleForInference?: string | null;
}>;

export function resolveStoreOrderNotificationDisplay(input: StoreOrderNotificationDisplayInput): {
  domain: typeof STORE_ORDER_DOMAIN;
  title: string;
  avatarUrl: string | null;
  preview: string;
  viewerRole: StoreOrderNotificationViewerRole;
} {
  if (input.chatDomain !== STORE_ORDER_DOMAIN) {
    throw new Error(`dibay_store_order_notification_rejects:${input.chatDomain}`);
  }
  if (!input.eventId.trim()) throw new Error("dibay_store_order_notification_event_required");
  if (
    input.roomType != null ||
    input.directKey != null ||
    input.pathname != null ||
    input.titleForInference != null
  ) {
    throw new Error("dibay_store_order_notification_reinference_forbidden");
  }
  assertStoreOrderOwnedRoom({
    roomId: input.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  if (input.viewerRole === "customer") {
    if (input.customerName?.trim() || input.customerAvatarUrl?.trim()) {
      // 고객 알림 surface 에 회원 identity 혼입 금지 (표시는 매장)
      throw new Error("dibay_store_order_notification_customer_member_identity_forbidden");
    }
    return {
      domain: STORE_ORDER_DOMAIN,
      title: input.storeName?.trim() || STORE_ORDER_STORE_NAME_PLACEHOLDER,
      avatarUrl: input.storeImageUrl?.trim() || null,
      preview: input.messagePreview?.trim() || "",
      viewerRole: "customer",
    };
  }
  return {
    domain: STORE_ORDER_DOMAIN,
    title: input.customerName?.trim() || STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
    avatarUrl: input.customerAvatarUrl?.trim() || null,
    preview: input.messagePreview?.trim() || "",
    viewerRole: "owner",
  };
}

/** @deprecated Phase 9 — use resolveStoreOrderSoundKey(role) customer|owner 분리 */
export const STORE_ORDER_SOUND_EVENT_KEY = "delivery_chat_message_received_user" as const;

export const STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER = "delivery_chat_message_received_user" as const;
export const STORE_ORDER_SOUND_EVENT_KEY_OWNER = "delivery_chat_message_received_owner" as const;

export function resolveStoreOrderSoundKey(
  receiverRole: StoreOrderNotificationViewerRole = "customer"
): {
  domain: typeof STORE_ORDER_DOMAIN;
  eventKey: string;
  receiverRole: StoreOrderNotificationViewerRole;
} {
  return {
    domain: STORE_ORDER_DOMAIN,
    eventKey:
      receiverRole === "owner"
        ? STORE_ORDER_SOUND_EVENT_KEY_OWNER
        : STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
    receiverRole,
  };
}

export const storeOrderNotificationPort: MessengerNotificationPort = {
  domain: STORE_ORDER_DOMAIN,
  requiresStoredChatDomain: true,
};

export const storeOrderSoundPort: MessengerSoundPort = {
  domain: STORE_ORDER_DOMAIN,
  soundKeyContract: STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
};
