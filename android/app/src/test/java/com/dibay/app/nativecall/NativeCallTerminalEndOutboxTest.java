package com.dibay.app.nativecall;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** Bug A — durable native end PATCH outbox + Bug B(a) diagnostic end reasons. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeCallTerminalEndOutboxTest {
  /** Mirror of TRUSTED_CLIENT_ENDED_REASONS + CLIENT_REASON_ALIASES keys (call-terminal-reason-authority.ts). */
  private static final List<String> SERVER_TRUSTED_OR_ALIASED =
      Arrays.asList(
          "failed_permission",
          "failed_insecure_context",
          "failed_ice",
          "failed_network",
          "failed_signaling",
          "heartbeat_timeout",
          "redial_replaced",
          "stale_ringing_expired",
          "incoming_policy_superseded",
          "reconcile_stale_ringing",
          "reconcile_stale_active",
          "cancelled",
          "cancel",
          "caller_cancel",
          "caller_cancelled",
          "declined",
          "reject",
          "rejected",
          "callee_reject",
          "callee_rejected",
          "timeout",
          "ring_timeout",
          "missed_timeout",
          "no_answer",
          "peer_busy",
          "callee_busy",
          "busy",
          "answered_elsewhere",
          "network_lost",
          "disconnected",
          "disconnect",
          "ended_by_caller",
          "ended_by_callee");

  private Context context;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeCallTerminalEndOutbox.clearForTests(context);
  }

  @After
  public void tearDown() {
    NativeCallTerminalEndOutbox.clearForTests(context);
  }

  @Test
  public void record_persistsLaneAndReason_replacingSameCall() {
    NativeCallTerminalEndOutbox.record(
        context, "c1", NativeCallTerminalEndOutbox.LANE_VOICE, NativeCallEndReason.USER_END);
    NativeCallTerminalEndOutbox.record(
        context, "c1", NativeCallTerminalEndOutbox.LANE_VOICE, NativeCallEndReason.TASK_REMOVED);
    NativeCallTerminalEndOutbox.record(
        context, "c2", NativeCallTerminalEndOutbox.LANE_VIDEO, NativeCallEndReason.REMOTE_LEFT);

    List<NativeCallTerminalEndOutbox.Entry> entries = NativeCallTerminalEndOutbox.snapshot(context);
    assertEquals(2, entries.size());
    assertEquals("c1", entries.get(0).callId);
    assertEquals(NativeCallTerminalEndOutbox.LANE_VOICE, entries.get(0).lane);
    assertEquals(NativeCallEndReason.TASK_REMOVED, entries.get(0).reason);
    assertEquals(NativeCallTerminalEndOutbox.LANE_VIDEO, entries.get(1).lane);
  }

  @Test
  public void settle_definitiveRemoves_transientKeeps() {
    NativeCallTerminalEndOutbox.record(context, "c1", "video", NativeCallEndReason.USER_END);

    NativeCallTerminalEndOutbox.settle(context, "c1", false, 0);
    NativeCallTerminalEndOutbox.settle(context, "c1", false, 503);
    NativeCallTerminalEndOutbox.settle(context, "c1", false, 401);
    assertEquals(1, NativeCallTerminalEndOutbox.snapshot(context).size());

    NativeCallTerminalEndOutbox.settle(context, "c1", true, 200);
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());

    NativeCallTerminalEndOutbox.record(context, "c2", "video", NativeCallEndReason.USER_END);
    NativeCallTerminalEndOutbox.settle(context, "c2", false, 400);
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());
  }

  @Test
  public void drainOnProcessStart_resendsAndAcksOnlyDefinitive() {
    NativeCallTerminalEndOutbox.record(context, "ok-call", "voice", NativeCallEndReason.TASK_REMOVED);
    NativeCallTerminalEndOutbox.record(context, "net-call", "video", NativeCallEndReason.USER_END);
    List<String> sent = new ArrayList<>();

    NativeCallTerminalEndOutbox.drainOnProcessStart(
        context,
        (app, entry, cb) -> {
          sent.add(entry.callId + "|" + entry.lane + "|" + entry.reason);
          if ("ok-call".equals(entry.callId)) {
            cb.onDone(true, 200);
          } else {
            cb.onDone(false, 0);
          }
        });

    assertEquals(
        Arrays.asList(
            "ok-call|voice|" + NativeCallEndReason.TASK_REMOVED,
            "net-call|video|" + NativeCallEndReason.USER_END),
        sent);
    List<NativeCallTerminalEndOutbox.Entry> left = NativeCallTerminalEndOutbox.snapshot(context);
    assertEquals(1, left.size());
    assertEquals("net-call", left.get(0).callId);
  }

  @Test
  public void endReason_fromSource_mapsTriggers() {
    assertEquals(NativeCallEndReason.USER_END, NativeCallEndReason.fromSource(null));
    assertEquals(NativeCallEndReason.USER_END, NativeCallEndReason.fromSource("ui"));
    assertEquals(NativeCallEndReason.DOCK_END, NativeCallEndReason.fromSource("dock"));
    assertEquals(
        NativeCallEndReason.NOTIFICATION_END, NativeCallEndReason.fromSource("notification"));
    assertEquals(NativeCallEndReason.BACK_CANCEL, NativeCallEndReason.fromSource("back:gesture"));
    assertEquals(
        NativeCallEndReason.ACTIVITY_DESTROYED,
        NativeCallEndReason.fromSource("activity_destroyed"));
    assertEquals(NativeCallEndReason.TASK_REMOVED, NativeCallEndReason.fromSource("task_removed"));
    assertEquals(NativeCallEndReason.REMOTE_LEFT, NativeCallEndReason.fromSource("remote_left"));
    assertEquals(NativeCallEndReason.FAIL_PROPAGATE, NativeCallEndReason.fromSource("fail"));
    assertEquals(NativeCallEndReason.OTHER, NativeCallEndReason.fromSource("whatever"));
  }

  @Test
  public void endReasons_areNeverServerTrusted() {
    String[] all = {
      NativeCallEndReason.USER_END,
      NativeCallEndReason.DOCK_END,
      NativeCallEndReason.NOTIFICATION_END,
      NativeCallEndReason.BACK_CANCEL,
      NativeCallEndReason.ACTIVITY_DESTROYED,
      NativeCallEndReason.TASK_REMOVED,
      NativeCallEndReason.REMOTE_LEFT,
      NativeCallEndReason.FAIL_PROPAGATE,
      NativeCallEndReason.OTHER,
    };
    for (String reason : all) {
      assertTrue(reason, reason.startsWith("native_"));
      assertFalse(reason, SERVER_TRUSTED_OR_ALIASED.contains(reason));
      assertFalse(reason, reason.startsWith("admin_force_end:"));
    }
  }
}
