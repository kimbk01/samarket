package com.dibay.app;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLog;

/** FCM terminal types must invoke handler even when app is not visible. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = android.app.Application.class)
public class DibayFirebaseMessagingServiceTerminalTest {
  private Context context;
  private DibayFirebaseMessagingService service;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    service = Robolectric.setupService(DibayFirebaseMessagingService.class);
    ShadowLog.clear();
  }

  @Test
  public void onMessageReceived_callCanceled_marksConsumed_whenAppNotVisible() {
    String callId = "fcm-terminal-" + System.currentTimeMillis();
    Map<String, String> data = new HashMap<>();
    data.put("type", "call_canceled");
    data.put("callId", callId);
    data.put("title", "통화");
    data.put("body", "");

    RemoteMessage message =
        new RemoteMessage.Builder("dibay-test-sender").setData(data).build();

    // appVisible=false (no resumed MainActivity)
    service.onMessageReceived(message);

    assertTrue(DibayCallConsumedStore.isConsumed(context, callId));
    assertLogContains("terminal_received");
    assertLogContains("call_canceled_native_handled");
  }

  private void assertLogContains(String needle) {
    boolean found = false;
    for (ShadowLog.LogItem item : ShadowLog.getLogs()) {
      if (item.tag != null && "DIBAY_CALL".equals(item.tag) && item.msg != null && item.msg.contains(needle)) {
        found = true;
        break;
      }
    }
    assertTrue("missing log: " + needle, found);
  }
}
