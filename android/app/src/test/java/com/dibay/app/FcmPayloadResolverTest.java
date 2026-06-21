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
    order.put("type", "order_status");
    order.put("orderId", "order-1");
    assertEquals("/orders/store/order-1", FcmPayloadResolver.resolveRouteUrl(order));

    Map<String, String> community = new HashMap<>();
    community.put("type", "community_comment");
    community.put("postId", "post-1");
    assertEquals("/philife/posts/post-1", FcmPayloadResolver.resolveRouteUrl(community));
  }
}
