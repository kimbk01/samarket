import { describe, expect, it } from "vitest";

/**
 * 배달(store_order) 채팅 차단 SSOT — 수동/E2E 검증 시나리오.
 * 자동화는 주문·매장 픽스처 비용이 커서 TODO 로 남긴다.
 *
 * 전제: buyer A ↔ store owner B 가 user_social_relations blocked (either way).
 */
describe.todo("store-order chat block SSOT E2E scenarios", () => {
  it("ensure-chat: 주문 채팅방 생성은 commerce 필수 경로로 허용될 수 있음 (차단과 무관한 주문 컨텍스트)");
  it("POST .../community-messenger/rooms/:id/messages: 발송 RPC는 허용될 수 있으나 수신 알림·badge는 actor gate로 차단");
  it("notifyCommunityChatInAppForRecipients: getBlockedRelation 으로 in-app 알림 생략");
  it("appendUserNotification: actor gate 로 FCM·인박스 insert 생략");
  it("publishMessengerRoomBumpAfterMutation → bumpNotificationTarget(actorUserId): badge/red dot 생략");
  it("store_order owner hub badge: 차단 시 store_order_participant_unread 증가 없음 (수동 확인)");
});

// 통화 차단 SSOT — lib/test-utils/__tests__/ssot-source-contract-markers.test.ts
