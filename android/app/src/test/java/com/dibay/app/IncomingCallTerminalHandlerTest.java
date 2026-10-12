package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.test.core.app.ApplicationProvider;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLog;
import org.robolectric.shadows.ShadowApplication;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = android.app.Application.class)
public class IncomingCallTerminalHandlerTest {
  private Context context;

  @Before
  public void setUp() {
    Application app = ApplicationProvider.getApplicationContext();
    context = app.getApplicationContext();
    ShadowLog.clear();
    // RingOwner state is static — isolate from other test classes in the same sandbox.
    IncomingCallRingOwner.clearForTests();
    context.getSharedPreferences("dibay_incoming_call_native_store", Context.MODE_PRIVATE).edit().clear().apply();
    ForegroundIncomingCallRegistry.setActive(null);
    DibayCallConsumedStore.mark(context, "stale", "cancelled");
    // reset coordinator state for isolated tests
    IncomingCallActionCoordinator.complete("stale", "cancelled");
  }

  @Test
  public void handle_marksConsumed_stopsCoordinator_clearsPending_andBroadcastsTerminal() {
    String callId = "terminal-unit-1";
    seedPendingRoutes(callId);

    IncomingCallTerminalHandler.handle(context, callId, "cancelled", "unit_test");

    assertTrue(DibayCallConsumedStore.isConsumed(context, callId));
    assertTrue(IncomingCallActionCoordinator.isCompleted(callId));
    assertFalse(hasPendingCallRoute());
    assertFalse(hasPendingPushRoute());

    List<Intent> broadcasts = ShadowApplication.getInstance().getBroadcastIntents();
    boolean terminalBroadcast = false;
    for (Intent intent : broadcasts) {
      if (IncomingCallActivity.ACTION_TERMINAL.equals(intent.getAction())
          && callId.equals(intent.getStringExtra(IncomingCallActivity.EXTRA_CALL_ID))) {
        terminalBroadcast = true;
        break;
      }
    }
    assertTrue("ACTION_TERMINAL broadcast missing", terminalBroadcast);

    assertLogContains("terminal_received");
    assertLogContains("terminal_tombstone_mark");
    assertLogContains("ring_stop");
    assertLogContains("call_canceled_native_handled");
    assertLogContains("terminal_handler_done");
  }

  @Test
  public void lateTerminalForPreviousCall_keepsRingingCallRingAndPendingState() {
    String previousCall = "terminal-prev-A";
    String ringingCall = "terminal-ringing-B";
    // Caller cancelled A and redialed B; B is ringing when A's late terminal push arrives.
    assertTrue(IncomingCallRingOwner.start(context, ringingCall));
    seedPendingRoutes(ringingCall);
    context
        .getSharedPreferences("dibay_call_pending_route", Context.MODE_PRIVATE)
        .edit()
        .putString(MainActivity.PENDING_CALL_ID_KEY, ringingCall)
        .apply();

    IncomingCallTerminalHandler.handle(context, previousCall, "cancelled", "fcm:call_canceled");

    assertTrue(DibayCallConsumedStore.isConsumed(context, previousCall));
    assertEquals(ringingCall, IncomingCallRingOwner.getActiveCallId());
    assertTrue("B call pending route must survive A's terminal", hasPendingCallRoute());
    assertTrue("pending push route must survive A's terminal", hasPendingPushRoute());
    assertLogContains("ring_stop_ignored_other_call");

    // B's own terminal still clears everything.
    IncomingCallTerminalHandler.handle(context, ringingCall, "cancelled", "fcm:call_canceled");
    assertEquals(null, IncomingCallRingOwner.getActiveCallId());
    assertFalse(hasPendingCallRoute());
    assertFalse(hasPendingPushRoute());
  }

  @Test
  public void terminalForPendingCallOfTerminatedCall_clearsOnlyThatCallRoute_whenOtherCallRings() {
    String previousCall = "terminal-prev-C";
    String ringingCall = "terminal-ringing-D";
    assertTrue(IncomingCallRingOwner.start(context, ringingCall));
    seedPendingRoutes(previousCall);
    context
        .getSharedPreferences("dibay_call_pending_route", Context.MODE_PRIVATE)
        .edit()
        .putString(MainActivity.PENDING_CALL_ID_KEY, previousCall)
        .apply();

    IncomingCallTerminalHandler.handle(context, previousCall, "cancelled", "fcm:call_canceled");

    assertFalse("terminated call's own pending route is dropped", hasPendingCallRoute());
    assertEquals(ringingCall, IncomingCallRingOwner.getActiveCallId());
  }

  @Test
  public void staleExpiredRingingRecord_doesNotBlockNormalTerminalCleanup() {
    String staleCall = "terminal-stale-E";
    String endingCall = "terminal-ending-F";
    seedNativeStore(staleCall, DibayIncomingCallNativeStore.STATE_RINGING, System.currentTimeMillis() - 60_000L);
    assertFalse(IncomingCallTerminalHandler.isOtherIncomingCallActive(context, endingCall));

    seedPendingRoutes(endingCall);
    IncomingCallTerminalHandler.handle(context, endingCall, "cancelled", "fcm:call_canceled");
    assertFalse("stale record must not keep pending state alive", hasPendingCallRoute());
    assertFalse(hasPendingPushRoute());
  }

  @Test
  public void unexpiredRingingRecordOfAnotherCall_countsAsActive() {
    seedNativeStore("terminal-live-G", DibayIncomingCallNativeStore.STATE_RINGING, System.currentTimeMillis() + 60_000L);
    assertTrue(IncomingCallTerminalHandler.isOtherIncomingCallActive(context, "terminal-prev-H"));
    assertFalse(IncomingCallTerminalHandler.isOtherIncomingCallActive(context, "terminal-live-G"));
  }

  @Test
  public void acceptHandoffOfAnotherCall_keepsItsPendingRoute_onLateTerminal() {
    String previousCall = "terminal-prev-I";
    String acceptingCall = "terminal-accepting-J";
    // B accepted: ring stopped (RingOwner idle), native store moved to connecting.
    seedNativeStore(acceptingCall, DibayIncomingCallNativeStore.STATE_CONNECTING, 0L);
    seedPendingRoutes(acceptingCall);
    context
        .getSharedPreferences("dibay_call_pending_route", Context.MODE_PRIVATE)
        .edit()
        .putString(MainActivity.PENDING_CALL_ID_KEY, acceptingCall)
        .apply();

    IncomingCallTerminalHandler.handle(context, previousCall, "cancelled", "fcm:call_canceled");

    assertTrue("accepting call pending route kept", hasPendingCallRoute());
    assertTrue("pending push route kept", hasPendingPushRoute());
    assertEquals(
        DibayIncomingCallNativeStore.STATE_CONNECTING,
        DibayIncomingCallNativeStore.getState(context, acceptingCall));
  }

  @Test
  public void lateTerminalForPreviousCall_keepsRingingCallsWakeLock() {
    String previousCall = "terminal-prev-K";
    String ringingCall = "terminal-ringing-L";
    assertTrue(IncomingCallRingOwner.start(context, ringingCall));
    IncomingCallWakeLock.acquire(context, ringingCall);
    android.os.PowerManager.WakeLock lock = org.robolectric.shadows.ShadowPowerManager.getLatestWakeLock();
    assertTrue(lock != null && lock.isHeld());

    IncomingCallTerminalHandler.handle(context, previousCall, "cancelled", "fcm:call_canceled");
    assertTrue("B's wake lock must survive A's terminal", lock.isHeld());

    IncomingCallTerminalHandler.handle(context, ringingCall, "cancelled", "fcm:call_canceled");
    assertFalse("B's own terminal releases its wake lock", lock.isHeld());
  }

  @Test
  public void handle_runsWhenAppNotVisible_backgroundSource() {
    String callId = "terminal-bg-2";
    // MainActivity.appVisible defaults false when activity not resumed.
    IncomingCallTerminalHandler.handle(context, callId, "cancelled", "fcm:call_canceled");
    assertTrue(DibayCallConsumedStore.isConsumed(context, callId));
    assertLogContains("terminal_received");
  }

  @Test
  public void isTerminalPushType_includesCallCanceledAliases() {
    assertTrue(IncomingCallTerminalHandler.isTerminalPushType("call_canceled"));
    assertTrue(IncomingCallTerminalHandler.isTerminalPushType("call_ended"));
    assertFalse(IncomingCallTerminalHandler.isTerminalPushType("incoming_call"));
  }

  private void seedPendingRoutes(String callId) {
    long now = System.currentTimeMillis();
    context
        .getSharedPreferences("dibay_call_pending_route", Context.MODE_PRIVATE)
        .edit()
        .putString("pending_path", "/community-messenger/calls/" + callId)
        .putLong("pending_at", now)
        .apply();
    context
        .getSharedPreferences("dibay_push_route", Context.MODE_PRIVATE)
        .edit()
        .putString("pending_path", "/community-messenger/calls/" + callId)
        .putLong("pending_at", now)
        .apply();
  }

  private void seedNativeStore(String callId, String state, long expiresAtMs) {
    context
        .getSharedPreferences("dibay_incoming_call_native_store", Context.MODE_PRIVATE)
        .edit()
        .clear()
        .putString("call_id", callId)
        .putString("state", state)
        .putLong("expires_at", expiresAtMs)
        .apply();
  }

  private boolean hasPendingCallRoute() {
    SharedPreferences prefs =
        context.getSharedPreferences("dibay_call_pending_route", Context.MODE_PRIVATE);
    return prefs.contains("pending_path");
  }

  private boolean hasPendingPushRoute() {
    SharedPreferences prefs = context.getSharedPreferences("dibay_push_route", Context.MODE_PRIVATE);
    return prefs.contains("pending_path");
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
