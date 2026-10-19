package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class DibayAppRouteGuardTest {

  @Test
  public void rejectsOffOriginAndMalformed() {
    String[] bad = {
      null, "", "  ", "//evil.com", "//evil.com/x", "/\\evil.com", "/\\/evil.com", "\\\\evil.com",
      "https://evil.com/x", "javascript:alert(1)", "evil.com", "/market\nx", "/mar\u0000ket",
      "/unknown-root/x", "/api/me/notifications", "/dev/tools"
    };
    for (String raw : bad) {
      assertNull(String.valueOf(raw), DibayAppRouteGuard.safeAppPath(raw));
    }
  }

  @Test
  public void keepsExistingAppRoutesUnchanged() {
    String[] good = {
      "/",
      "/community-messenger/rooms/r1",
      "/community-messenger/rooms/r1?focus=call-history&callId=c1",
      "/community-messenger/rooms/r1?type=group",
      "/community-messenger/calls/s1?action=accept",
      "/community-messenger/calls/logs?callId=c1",
      "/community-messenger/calls-v4/s1?action=accept",
      "/chats/r1",
      "/orders/store/o1",
      "/philife/posts/p1",
      "/community/posts/p1",
      "/stores/owner/orders?orderId=o1",
      "/support/cases/abc",
      "/events/e1",
      "/notifications/n1",
      "/notifications?fallback=origin_unavailable",
      "/mypage/notices/abc",
      "/products/123",
      "/u/someone",
    };
    for (String path : good) {
      assertEquals(path, DibayAppRouteGuard.safeAppPath(path));
      assertEquals(path, DibayAppRouteGuard.safeAppPath("  " + path + "  "));
    }
  }
}
