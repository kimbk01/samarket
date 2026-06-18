package com.dibay.app;

import static org.junit.Assert.assertFalse;
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
    IncomingCallSessionMachine.resetForTest();
  }

  private void seedActiveSession(String callId) {
    IncomingCallPayload payload =
        new IncomingCallPayload(
            callId,
            "room-1",
            "caller-1",
            "Caller",
            null,
            "audio",
            null,
            "Incoming",
            "Call",
            null);
    IncomingCallSessionMachine.onIncomingFcmReceived(context, payload, System.currentTimeMillis());
    IncomingCallSessionMachine.onRinging(callId, "unit_test");
  }

  @Test
  public void onMessageReceived_callCanceled_deferredWhenServerProbeFails() {
    String callId = "fcm-terminal-cancel";
    seedActiveSession(callId);
    Map<String, String> data = new HashMap<>();
    data.put("type", "call_canceled");
    data.put("callId", callId);
    data.put("title", "통화");
    data.put("body", "");

    service.onMessageReceived(new RemoteMessage.Builder("dibay-test-sender").setData(data).build());

    assertFalse(DibayCallConsumedStore.isConsumed(context, callId));
    assertLogContains("server_probe_failed_deferred");
  }

  @Test
  public void onMessageReceived_callRejected_marksConsumed_whenAppNotVisible() {
    String callId = "fcm-rejected-active";
    seedActiveSession(callId);
    Map<String, String> data = new HashMap<>();
    data.put("type", "call_rejected");
    data.put("callId", callId);
    data.put("title", "통화");
    data.put("body", "");

    service.onMessageReceived(new RemoteMessage.Builder("dibay-test-sender").setData(data).build());

    assertTrue(DibayCallConsumedStore.isConsumed(context, callId));
    assertLogContains("terminal_received");
    assertLogContains("terminal_handler_done");
  }

  @Test
  public void onMessageReceived_callCanceled_staleWithoutActiveSession() {
    String callId = "fcm-terminal-stale";
    Map<String, String> data = new HashMap<>();
    data.put("type", "call_canceled");
    data.put("callId", callId);

    service.onMessageReceived(new RemoteMessage.Builder("dibay-test-sender").setData(data).build());

    assertFalse(DibayCallConsumedStore.isConsumed(context, callId));
    assertLogContains("stale_duplicate_ignored");
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
