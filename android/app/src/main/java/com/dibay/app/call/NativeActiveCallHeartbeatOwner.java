package com.dibay.app.call;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Session-bound native active-call heartbeat.
 *
 * Production liveness for native-established calls. This intentionally mirrors the web
 * active-call heartbeat cadence, not the 300s shadow presence lease cadence.
 */
public final class NativeActiveCallHeartbeatOwner {
  private static final String TAG = "DibayNativeActiveHeartbeat";

  /** Mirror lib/call/native/call-heartbeat-watchdog.ts CALL_HEARTBEAT_INTERVAL_MS. */
  public static final long ACTIVE_HEARTBEAT_INTERVAL_MS = 10_000L;

  public interface HeartbeatCallback {
    void onDone(boolean ok, int status, String error);
  }

  public interface HeartbeatTransport {
    void heartbeat(Context app, String callId, HeartbeatCallback callback);
  }

  public interface LiveGate {
    boolean isHeartbeatLive(String callId);
  }

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final AtomicInteger GENERATION = new AtomicInteger(0);

  private static String activeCallId = null;
  private static int activeGeneration = 0;
  private static Runnable pending = null;
  private static HeartbeatTransport transport = null;
  private static LiveGate liveGate = null;
  private static int heartbeatCountForTests = 0;

  private NativeActiveCallHeartbeatOwner() {}

  public static void start(
      Context context, String callId, HeartbeatTransport heartbeatTransport, LiveGate gate) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    if (heartbeatTransport == null || gate == null) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    int gen;
    synchronized (LOCK) {
      clearPendingLocked();
      activeCallId = sid;
      activeGeneration = GENERATION.incrementAndGet();
      gen = activeGeneration;
      transport = heartbeatTransport;
      liveGate = gate;
      heartbeatCountForTests = 0;
    }
    Log.i(TAG, "active_heartbeat_start callId=" + sid + " intervalMs=" + ACTIVE_HEARTBEAT_INTERVAL_MS);
    fireHeartbeat(app, sid, gen, "immediate_connected");
  }

  public static void stop(String callId, String reason) {
    String sid = callId != null ? callId.trim() : "";
    synchronized (LOCK) {
      if (sid.isEmpty() || activeCallId == null || !sid.equals(activeCallId)) return;
      Log.i(TAG, "active_heartbeat_stop callId=" + sid + " reason=" + safe(reason));
      clearPendingLocked();
      activeCallId = null;
      activeGeneration = GENERATION.incrementAndGet();
      transport = null;
      liveGate = null;
    }
  }

  public static boolean isActiveForTests(String callId) {
    synchronized (LOCK) {
      return callId != null && callId.trim().equals(activeCallId);
    }
  }

  public static int heartbeatCountForTests() {
    synchronized (LOCK) {
      return heartbeatCountForTests;
    }
  }

  public static void resetForTests() {
    synchronized (LOCK) {
      clearPendingLocked();
      activeCallId = null;
      activeGeneration = GENERATION.incrementAndGet();
      transport = null;
      liveGate = null;
      heartbeatCountForTests = 0;
    }
  }

  public static void flushForTests() {
    Runnable next;
    synchronized (LOCK) {
      next = pending;
    }
    if (next != null) {
      MAIN.removeCallbacks(next);
      next.run();
    }
  }

  private static void fireHeartbeat(Context app, String sid, int gen, String source) {
    HeartbeatTransport t;
    LiveGate gate;
    synchronized (LOCK) {
      if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) return;
      t = transport;
      gate = liveGate;
    }
    if (t == null || gate == null) return;
    if (!gate.isHeartbeatLive(sid)) {
      stop(sid, "not_live_gate");
      return;
    }
    t.heartbeat(
        app,
        sid,
        (ok, status, error) -> {
          synchronized (LOCK) {
            if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) return;
            heartbeatCountForTests += 1;
          }
          if (!ok) {
            String err = error != null ? error : "";
            if ("not_live".equals(err) || err.contains("not_live")) {
              stop(sid, "server_not_live");
              return;
            }
            Log.w(TAG, "active_heartbeat_failed callId=" + sid + " err=" + err + " source=" + source);
          } else {
            Log.i(TAG, "active_heartbeat_ok callId=" + sid + " source=" + source);
          }
          scheduleNext(app, sid, gen);
        });
  }

  private static void scheduleNext(Context app, String sid, int gen) {
    synchronized (LOCK) {
      if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) return;
      clearPendingLocked();
      Runnable runnable =
          () -> {
            synchronized (LOCK) {
              if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) return;
              pending = null;
            }
            fireHeartbeat(app, sid, gen, "periodic");
          };
      pending = runnable;
      MAIN.postDelayed(runnable, ACTIVE_HEARTBEAT_INTERVAL_MS);
    }
  }

  private static void clearPendingLocked() {
    if (pending != null) {
      MAIN.removeCallbacks(pending);
      pending = null;
    }
  }

  private static String safe(String value) {
    return value == null ? "" : value.trim();
  }
}
