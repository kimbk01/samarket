package com.dibay.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import com.dibay.app.call.DibayActiveCallSessionManager;
import java.util.HashMap;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLog;

/** P0 — ring missed_timeout must not terminate active/connecting calls (web_in_app path). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class IncomingCallMissedTimeoutGuardTest {
  private Context context;

  @Before
  public void setUp() {
    Application app = ApplicationProvider.getApplicationContext();
    context = app.getApplicationContext();
    ShadowLog.clear();
    DibayActiveCallSessionManager.clearSession();
    IncomingCallActionCoordinator.complete("stale", "cancelled");
  }

  @After
  public void tearDown() {
    DibayActiveCallSessionManager.clearSession();
  }

  @Test
  public void handleMissedTimeout_noOpWhenActiveConnected() {
    String callId = "active-guard-1";
    IncomingCallPayload payload = samplePayload(callId);
    DibayActiveCallSessionManager.bindActiveCall(
        callId, "voice", DibayActiveCallSessionManager.PHASE_CONNECTED);

    IncomingCallActionCoordinator.handleMissedTimeout(context, payload);

    assertFalse(IncomingCallActionCoordinator.isCompleted(callId));
    assertFalse(DibayCallConsumedStore.isConsumed(context, callId));
    assertTrue(DibayActiveCallSessionManager.isConnected());
  }

  @Test
  public void handleMissedTimeout_purgesWhenStillRinging() {
    String callId = "ring-missed-1";
    IncomingCallPayload payload = samplePayload(callId);
    long expiresAt = System.currentTimeMillis() + 60_000L;
    DibayIncomingCallNativeStore.setRinging(context, payload, "/community-messenger/calls/" + callId, expiresAt);
    IncomingCallActionCoordinator.registerIncoming(context, callId);

    IncomingCallActionCoordinator.handleMissedTimeout(context, payload);

    assertTrue(IncomingCallActionCoordinator.isCompleted(callId));
    assertTrue(DibayCallConsumedStore.isConsumed(context, callId));
    DibayActiveCallSessionManager.clearSession();
  }

  @Test
  public void handleMissedTimeout_suppressedAfterWebAcceptConsumed() {
    String callId = "web-accept-cancel-1";
    IncomingCallPayload payload = samplePayload(callId);
    long expiresAt = System.currentTimeMillis() + 60_000L;
    DibayIncomingCallNativeStore.setRinging(context, payload, "/community-messenger/calls/" + callId, expiresAt);
    IncomingCallActionCoordinator.scheduleMissedTimeout(context, payload);
    DibayCallConsumedStore.mark(context, callId, "accepted");
    IncomingCallActionCoordinator.cancelMissedTimeout(callId);

    IncomingCallActionCoordinator.handleMissedTimeout(context, payload);

    assertFalse(IncomingCallActionCoordinator.isCompleted(callId));
  }

  @Test
  public void purgeCallPresentation_missedBlockedWhenActive() {
    String callId = "purge-block-active-1";
    DibayActiveCallSessionManager.bindActiveCall(
        callId, "voice", DibayActiveCallSessionManager.PHASE_CONNECTED);

    IncomingCallSessionCleanup.purgeCallPresentation(context, callId, "missed");

    assertTrue(DibayActiveCallSessionManager.isConnected());
    assertFalse(IncomingCallActionCoordinator.isCompleted(callId));
  }

  @Test
  public void requestCleanup_missedBlockedWhenConnected() {
    String callId = "cleanup-block-missed-1";
    DibayActiveCallSessionManager.bindActiveCall(
        callId, "voice", DibayActiveCallSessionManager.PHASE_CONNECTED);

    boolean cleaned = DibayActiveCallSessionManager.requestCleanup(context, callId, "missed");

    assertFalse(cleaned);
    assertTrue(DibayActiveCallSessionManager.isConnected());
  }

  private static IncomingCallPayload samplePayload(String callId) {
    Map<String, String> data = new HashMap<>();
    data.put("type", "incoming_call");
    data.put("callId", callId);
    data.put("roomId", "room-" + callId);
    data.put("callerId", "caller-1");
    data.put("callerName", "Tester");
    data.put("callType", "voice");
    return FcmPayloadResolver.resolveIncomingCallPayload(data, "Tester", "incoming");
  }
}
