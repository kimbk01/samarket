package com.dibay.app.call;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Test;

/** P4 — forbidden cleanup reason guard */
public class DibayActiveCallSessionManagerTest {

  @After
  public void tearDown() {
    DibayActiveCallSessionManager.clearSession();
  }

  @Test
  public void blocksForbiddenCleanupReasons() {
    assertFalse(DibayActiveCallSessionManager.canCleanup("activity_destroyed"));
    assertFalse(DibayActiveCallSessionManager.canCleanup("webview_reload"));
    assertFalse(DibayActiveCallSessionManager.canCleanup("notification_dismissed"));
    assertFalse(DibayActiveCallSessionManager.canCleanup("screen_off"));
    assertFalse(DibayActiveCallSessionManager.canCleanup("backgrounded"));
    assertFalse(DibayActiveCallSessionManager.canCleanup("app_swipe"));
    assertFalse(DibayActiveCallSessionManager.canCleanup("unknown"));
  }

  @Test
  public void allowsLocalAndRemoteEnd() {
    assertTrue(DibayActiveCallSessionManager.canCleanup("local_ended"));
    assertTrue(DibayActiveCallSessionManager.canCleanup("remote_ended"));
    assertTrue(DibayActiveCallSessionManager.canCleanup("heartbeat_timeout"));
  }
}
