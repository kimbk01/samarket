package com.dibay.app.call;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** P4 — forbidden cleanup reason guard */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class DibayActiveCallSessionManagerTest {
  private final Context context = ApplicationProvider.getApplicationContext().getApplicationContext();

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

  @Test
  public void blocksMissedCleanupWhileConnected() {
    DibayActiveCallSessionManager.bindActiveCall(
        "call-missed-block", "voice", DibayActiveCallSessionManager.PHASE_CONNECTED);
    assertFalse(
        DibayActiveCallSessionManager.requestCleanup(
            context, "call-missed-block", "missed"));
    assertTrue(DibayActiveCallSessionManager.isConnected());
  }
}
