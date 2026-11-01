package com.dibay.app;

import static org.junit.Assert.assertEquals;

import java.util.HashMap;
import java.util.Map;
import org.junit.Ignore;
import org.junit.Test;

public class FcmPayloadResolverTest {
  @Test
  public void resolveRouteUrl_prefersExplicitRouteUrl() {
    Map<String, String> data = new HashMap<>();
    data.put("type", "admin_marketing_banner");
    data.put("routeUrl", "/community?banner=camp-1");
    data.put("roomId", "room-ignored");

    assertEquals("/community?banner=camp-1", FcmPayloadResolver.resolveRouteUrl(data));
  }

  @Test
  public void resolveRouteUrl_missedCallWithRoomFocus_matchesWebContract() {
    Map<String, String> data = new HashMap<>();
    data.put("type", "missed_call");
    data.put("roomId", "room-9");
    data.put("callId", "sess-9");

    assertEquals(
        "/community-messenger/rooms/room-9?focus=call-history&callId=sess-9",
        FcmPayloadResolver.resolveRouteUrl(data));
  }

  @Test
  public void resolveRouteUrl_routesChatTradeOrderAndCommunityPayloads() {
    Map<String, String> chat = new HashMap<>();
    chat.put("type", "chat_message");
    chat.put("roomId", "cm-1");
    assertEquals("/community-messenger/rooms/cm-1", FcmPayloadResolver.resolveRouteUrl(chat));

    Map<String, String> trade = new HashMap<>();
    trade.put("type", "trade_message");
    trade.put("roomId", "trade-room-1");
    assertEquals("/chats/trade-room-1", FcmPayloadResolver.resolveRouteUrl(trade));

    Map<String, String> order = new HashMap<>();
    order.put("type", "delivery_order");
    order.put("orderId", "order-1");
    assertEquals("/orders/store/order-1", FcmPayloadResolver.resolveRouteUrl(order));
  }

  /**
   * 계약(C2): 댓글 예비 경로 = 게시글 `/community/posts/{id}` (웹과 같음). 지금 Android 는 없는 라우트
   * `/philife/posts/{id}` 를 만든다(N6). 서버가 항상 url 을 보내 실제 탭에는 쓰이지 않는다.
   * N1(Android 네이티브) Owner 승인 후 해제 — docs/audit/notification-android-native-e-plan-2026-11-01.md
   */
  @Ignore("N1 승인 대기 — 계약: /community/posts/post-1 (현재 Android: /philife/posts/post-1)")
  @Test
  public void resolveRouteUrl_communityCommentFallback_matchesWebContract() {
    Map<String, String> community = new HashMap<>();
    community.put("type", "community_comment");
    community.put("postId", "post-1");
    assertEquals("/community/posts/post-1", FcmPayloadResolver.resolveRouteUrl(community));
  }

  /**
   * 계약(C2): 승인 경로 없는 옛 공지 봉투 → 알림 상세(웹·iOS 와 같음). 이 테스트는 2026-08-15 부터 웹과 다른
   * 「목록(?tab=system)」을 정답으로 고정하고 있었다(재감사 2026-11-01 §2-3). 현재 서버는 이 모양을 보내지 않는다.
   * step4 설계 B(Owner 승인 2026-11-02)로 웹과 같아졌다.
   */
  @Test
  public void resolveRouteUrl_envelopeNotice_prefersCanonicalOverLegacyUrl() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_notice");
    data.put("campaignChannel", "push_and_in_app");
    data.put("targetKind", "notification");
    data.put("targetTab", "system");
    data.put("targetNotificationId", "evt-notice-1");
    data.put("url", "/legacy-bypass");
    data.put("routeUrl", "/legacy-bypass");

    assertEquals("/notifications/evt-notice-1", FcmPayloadResolver.resolveRouteUrl(data));
  }

  /** 계약(C2): 승인 경로 없는 옛 마케팅 봉투(앱 안 행 있음) → 알림 상세. 위와 같은 이유. */
  @Ignore("N1 승인 대기 — 계약: /notifications/evt-mkt-1 (현재 Android: /notifications?tab=marketing&notificationId=…)")
  @Test
  public void resolveRouteUrl_envelopeMarketingPersistent_canonicalMarketingTab() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_marketing");
    data.put("campaignChannel", "push_and_in_app");
    data.put("targetNotificationId", "evt-mkt-1");
    data.put("url", "/community?banner=x");

    assertEquals("/notifications/evt-mkt-1", FcmPayloadResolver.resolveRouteUrl(data));
  }

  /**
   * step4 설계 B (Owner 승인 2026-11-02 · N1 잔여): 서버가 보내는 「푸시 전용」 공지·시스템 봉투 모양
   * (`campaign-notification-presentation.ts` — 알림 id 없음 + targetApprovedRoute) → 지정 목적지.
   * 이전 Android: 공지는 id 가 없어 목록, 시스템은 분기가 없어 항상 목록.
   */
  @Test
  public void resolveRouteUrl_envelopeNoticeAndSystemPushOnly_useApprovedRoute() {
    for (String eventClass : new String[] {"admin_notice", "admin_system"}) {
      Map<String, String> data = new HashMap<>();
      data.put("schemaVersion", "1");
      data.put("eventClass", eventClass);
      data.put("campaignChannel", "push_only");
      data.put("targetKind", "approved_internal_route");
      data.put("targetTab", "admin_system".equals(eventClass) ? "system" : "notice");
      data.put("targetApprovedRoute", "/mypage/customer-center/notice/post-1");
      data.put("url", "/mypage/customer-center/notice/post-1");

      assertEquals(
          eventClass,
          "/mypage/customer-center/notice/post-1",
          FcmPayloadResolver.resolveRouteUrl(data));
    }
  }

  /** 지정 목적지 없는 푸시 전용(서버 기본 = 알림센터 안내) → 그 경로 그대로. */
  @Test
  public void resolveRouteUrl_envelopeSystemPushOnly_inboxFallbackRouteKept() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_system");
    data.put("campaignChannel", "push_only");
    data.put("targetKind", "approved_internal_route");
    data.put("targetApprovedRoute", "/notifications?fallback=push_only");

    assertEquals("/notifications?fallback=push_only", FcmPayloadResolver.resolveRouteUrl(data));
  }

  /** 시스템 미리보기(알림 id 있음 · 지정 목적지 없음) → 알림 상세. 둘 다 없으면 목록. */
  @Test
  public void resolveRouteUrl_envelopeSystem_detailOrList() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_system");
    data.put("targetKind", "notification");
    data.put("targetNotificationId", "evt-sys-1");
    assertEquals("/notifications/evt-sys-1", FcmPayloadResolver.resolveRouteUrl(data));

    data.remove("targetNotificationId");
    assertEquals("/notifications", FcmPayloadResolver.resolveRouteUrl(data));
  }

  @Test
  public void resolveRouteUrl_envelopeMarketingPushOnly_usesApprovedRoute() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_marketing");
    data.put("campaignChannel", "push_only");
    data.put("targetKind", "approved_internal_route");
    data.put("targetApprovedRoute", "/market");
    data.put("url", "/notifications?tab=marketing");

    assertEquals("/market", FcmPayloadResolver.resolveRouteUrl(data));
  }

  @Test
  public void resolveRouteUrl_invalidEnvelope_blocksLegacyUrlBypass() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_marketing");
    data.put("campaignChannel", "push_only");
    data.put("targetKind", "approved_internal_route");
    data.put("url", "/community?banner=legacy");

    assertEquals("/notifications", FcmPayloadResolver.resolveRouteUrl(data));
  }

  @Test
  public void resolveRouteUrl_legacyOffOriginUrlNeverReturned() {
    String[] unsafe = {"//evil.com", "//evil.com/x", "/\\evil.com", "javascript:alert(1)"};
    for (String raw : unsafe) {
      Map<String, String> chat = new HashMap<>();
      chat.put("type", "chat_message");
      chat.put("roomId", "cm-1");
      chat.put("url", raw);
      assertEquals(raw, "/community-messenger/rooms/cm-1", FcmPayloadResolver.resolveRouteUrl(chat));

      Map<String, String> bare = new HashMap<>();
      bare.put("url", raw);
      assertEquals(raw, null, FcmPayloadResolver.resolveRouteUrl(bare));
    }
  }

  @Test
  public void resolveRouteUrl_absoluteHttpsLinkKeptForAppLinkMapping() {
    Map<String, String> data = new HashMap<>();
    data.put("url", "https://samarket.vercel.app/mypage/notices/abc");
    assertEquals("https://samarket.vercel.app/mypage/notices/abc", FcmPayloadResolver.resolveRouteUrl(data));
  }
}
