package com.dibay.app;

import static org.junit.Assert.assertEquals;

import java.util.HashMap;
import java.util.Map;
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

    Map<String, String> community = new HashMap<>();
    community.put("type", "community_comment");
    community.put("postId", "post-1");
    assertEquals("/philife/posts/post-1", FcmPayloadResolver.resolveRouteUrl(community));
  }

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

    assertEquals(
        "/notifications?tab=system&notificationId=evt-notice-1",
        FcmPayloadResolver.resolveRouteUrl(data));
  }

  @Test
  public void resolveRouteUrl_envelopeMarketingPersistent_canonicalMarketingTab() {
    Map<String, String> data = new HashMap<>();
    data.put("schemaVersion", "1");
    data.put("eventClass", "admin_marketing");
    data.put("campaignChannel", "push_and_in_app");
    data.put("targetNotificationId", "evt-mkt-1");
    data.put("url", "/community?banner=x");

    assertEquals(
        "/notifications?tab=marketing&notificationId=evt-mkt-1",
        FcmPayloadResolver.resolveRouteUrl(data));
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
}
