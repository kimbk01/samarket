/**
 * group Domain Port 집합 (Phase 5 · cutover OFF · UI 미연결).
 */
import type { MessengerDomainPorts } from "@/lib/messenger/contracts/ports";
import { cacheNamespacePrefix } from "@/lib/messenger/contracts/create-phase1-ports";
import { GROUP_DOMAIN } from "@/lib/messenger/group/domain";
import { groupIdentityPort } from "@/lib/messenger/group/identity";
import { groupPermissionPort } from "@/lib/messenger/group/permission";
import { groupRouterPort } from "@/lib/messenger/group/row-model";
import { groupPresentationPort } from "@/lib/messenger/group/presentation";
import { groupHeaderPort } from "@/lib/messenger/group/header";
import { groupPreviewPort } from "@/lib/messenger/group/preview";
import {
  groupBadgePort,
  groupReadPort,
  groupUnreadPort,
} from "@/lib/messenger/group/read-unread-badge";
import {
  groupNotificationPort,
  groupSoundPort,
} from "@/lib/messenger/group/notification-sound";

export const groupPorts: MessengerDomainPorts = {
  domain: GROUP_DOMAIN,
  router: groupRouterPort,
  identity: groupIdentityPort,
  list: { domain: GROUP_DOMAIN, listContract: { viewerUserId: "" } },
  rowModel: { domain: GROUP_DOMAIN },
  presentation: groupPresentationPort,
  header: groupHeaderPort,
  preview: groupPreviewPort,
  bootstrap: { domain: GROUP_DOMAIN, acceptsOnlyOwnDomain: true },
  cache: {
    domain: GROUP_DOMAIN,
    namespacePrefix: cacheNamespacePrefix(GROUP_DOMAIN),
    readOnlyUntilCutover: true,
  },
  realtime: { domain: GROUP_DOMAIN, requiresDomainTaggedPayload: true },
  read: groupReadPort,
  unread: groupUnreadPort,
  badge: groupBadgePort,
  notification: groupNotificationPort,
  sound: groupSoundPort,
  permission: groupPermissionPort,
};
