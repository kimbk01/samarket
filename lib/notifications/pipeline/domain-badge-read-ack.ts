/**
 * P3-a LOCK — Read mutation ACK is the sole Badge Generation Owner.
 *
 * mark* writes invalidate cache only. Routes call `issueDomainBadgeAuthorityForAck`
 * once, put the snapshot on the ACK body, and the client applies it without
 * `badge-count?fresh=1`.
 *
 * DO NOT: rebuild in mark* then force-rebuild in the route.
 * DO NOT: change Builder / Projection Authority / Boot / Poll / Engine.
 *
 * 2026-11-22 재개봉 기록 — Owner 「LOCK 재개봉·구현 승인」: Builder **입력 읽기만** DB 함수 1번(`get_member_badge_facts`)으로.
 * 이 파일의 ACK 소유권·계산·응답 필드는 그대로. 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage3-badge-facts-design-2026-11-22.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";

/** Build + cache exactly one Domain snapshot for this ACK (Generation Owner). */
export async function issueDomainBadgeAuthorityForAck(
  sb: SupabaseClient<any>,
  userId: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  return fetchDomainBadgeAuthorityPayload(sb, userId, { force: true });
}

/** Fields the client needs to commit Projection without a follow-up GET. */
export function domainBadgeReadMutationAckFields(domain: DomainBadgeAuthorityHttpPayload): {
  authority: "domain_badge";
  badgeGeneration: number;
  projectionVersionMs: number;
  nextBadgeTotal: number;
  nativeBadgeTotal: number;
  categoryCounts: DomainBadgeAuthorityHttpPayload["categoryCounts"];
  domainUnreadRooms: DomainBadgeAuthorityHttpPayload["domainUnreadRooms"];
  domainAppIcon: DomainBadgeAuthorityHttpPayload["domainAppIcon"];
  explainMatrix: DomainBadgeAuthorityHttpPayload["explainMatrix"];
  nonChatEventAttention: DomainBadgeAuthorityHttpPayload["nonChatEventAttention"];
  storeOrderBuyerDeliveryUnread: number;
  storeOrderOwnerChatUnread: number;
  unreadApprovedNotificationEvents: number;
  missedCallByRoom: DomainBadgeAuthorityHttpPayload["missedCallByRoom"];
  projection: DomainBadgeAuthorityHttpPayload["projection"];
  total: number;
  chatMessage: number;
  groupMessage: number;
  tradeMessage: number;
  tradeStatus: number;
  orderStatus: number;
  deliveryStatus: number;
  communityActivity: number;
  adminMarketingBanner: number;
  adminNotice: number;
  chat: number;
  group: number;
  trade: number;
  store: number;
  missedCall: number;
} {
  return {
    authority: "domain_badge",
    badgeGeneration: domain.projectionVersionMs,
    projectionVersionMs: domain.projectionVersionMs,
    nextBadgeTotal: domain.projection.bellTotal,
    nativeBadgeTotal: resolveMemberAppIconTotalForNativeFcm({
      memberAppIconWebTotal: domain.memberAppIconWebTotal,
      appIconTotal: domain.projection.appIconTotal,
    }),
    categoryCounts: domain.categoryCounts,
    domainUnreadRooms: domain.domainUnreadRooms,
    domainAppIcon: domain.domainAppIcon,
    explainMatrix: domain.explainMatrix,
    nonChatEventAttention: domain.nonChatEventAttention,
    storeOrderBuyerDeliveryUnread: domain.storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread: domain.storeOrderOwnerChatUnread,
    unreadApprovedNotificationEvents: domain.unreadApprovedNotificationEvents,
    missedCallByRoom: domain.missedCallByRoom,
    projection: domain.projection,
    total: domain.total,
    chatMessage: domain.chatMessage,
    groupMessage: domain.groupMessage,
    tradeMessage: domain.tradeMessage,
    tradeStatus: domain.tradeStatus,
    orderStatus: domain.orderStatus,
    deliveryStatus: domain.deliveryStatus,
    communityActivity: domain.communityActivity,
    adminMarketingBanner: domain.adminMarketingBanner,
    adminNotice: domain.adminNotice,
    chat: domain.chat,
    group: domain.group,
    trade: domain.trade,
    store: domain.store,
    missedCall: domain.missedCall,
  };
}
