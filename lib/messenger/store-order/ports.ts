/**
 * store_order Domain Port 집합 (Phase 4 · cutover OFF · UI 미연결).
 *
 * 단일 shared Presentation/Header 사용 금지 —
 * Customer / Owner Port 를 별도 export. aggregate.presentation 은 dual-port 강제 throw.
 */
import type {
  MessengerDomainPorts,
  MessengerHeaderPort,
  MessengerPresentationPort,
  MessengerPreviewPort,
} from "@/lib/messenger/contracts/ports";
import { cacheNamespacePrefix } from "@/lib/messenger/contracts/create-phase1-ports";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import { storeOrderIdentityPort } from "@/lib/messenger/store-order/identity";
import { storeOrderPermissionPort } from "@/lib/messenger/store-order/permission";
import { storeOrderRouterPort } from "@/lib/messenger/store-order/row-model";
import { storeOrderPreviewPort } from "@/lib/messenger/store-order/preview";
import {
  storeOrderBadgePort,
  storeOrderReadPort,
  storeOrderUnreadPort,
} from "@/lib/messenger/store-order/read-unread-badge";
import {
  storeOrderNotificationPort,
  storeOrderSoundPort,
} from "@/lib/messenger/store-order/notification-sound";
import { storeOrderCustomerPresentationPort } from "@/lib/messenger/store-order/customer-presentation-resolver";
import { storeOrderOwnerPresentationPort } from "@/lib/messenger/store-order/owner-presentation-resolver";
import { storeOrderCustomerHeaderPort } from "@/lib/messenger/store-order/customer-header";
import { storeOrderOwnerHeaderPort } from "@/lib/messenger/store-order/owner-header";

const dualPresentationGuard: MessengerPresentationPort = {
  domain: STORE_ORDER_DOMAIN,
  resolveDisplayIdentity: () => {
    throw new Error("dibay_store_order_use_dual_presentation_ports");
  },
};

const dualHeaderGuard: MessengerHeaderPort = {
  domain: STORE_ORDER_DOMAIN,
  resolveHeaderKind: (input) => {
    const role = input.viewerRole?.trim();
    if (role === "owner" || role === "admin") {
      return storeOrderOwnerHeaderPort.resolveHeaderKind(input);
    }
    if (role === "customer" || role === "buyer") {
      return storeOrderCustomerHeaderPort.resolveHeaderKind(input);
    }
    throw new Error("dibay_store_order_header_viewer_role_required");
  },
};

const previewPort: MessengerPreviewPort = storeOrderPreviewPort;

export {
  storeOrderCustomerPresentationPort,
  storeOrderOwnerPresentationPort,
  storeOrderCustomerHeaderPort,
  storeOrderOwnerHeaderPort,
};

export const storeOrderPorts: MessengerDomainPorts = {
  domain: STORE_ORDER_DOMAIN,
  router: storeOrderRouterPort,
  identity: storeOrderIdentityPort,
  list: { domain: STORE_ORDER_DOMAIN, listContract: { viewerUserId: "" } },
  rowModel: { domain: STORE_ORDER_DOMAIN },
  presentation: dualPresentationGuard,
  header: dualHeaderGuard,
  preview: previewPort,
  bootstrap: { domain: STORE_ORDER_DOMAIN, acceptsOnlyOwnDomain: true },
  cache: {
    domain: STORE_ORDER_DOMAIN,
    namespacePrefix: cacheNamespacePrefix(STORE_ORDER_DOMAIN),
    readOnlyUntilCutover: true,
  },
  realtime: { domain: STORE_ORDER_DOMAIN, requiresDomainTaggedPayload: true },
  read: storeOrderReadPort,
  unread: storeOrderUnreadPort,
  badge: storeOrderBadgePort,
  notification: storeOrderNotificationPort,
  sound: storeOrderSoundPort,
  permission: storeOrderPermissionPort,
};
