package com.dibay.app.call;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Session-bound Native presence lease renew (D Hybrid).
 *
 * WebView-independent. NOT a 10s heartbeat clone.
 * Cadence MUST mirror lib/call/call-active-presence.ts:
 *   CALL_PRESENCE_SHADOW_LEASE_TTL_MS / 2
 *
 * Production end authority remains legacy_hb (LEASE CUTOVER: NO).
 */
public final class NativePresenceLeaseRenewOwner {
  private static final String TAG = "DibayNativePresenceRenew";

  /** Mirror CALL_PRESENCE_SHADOW_LEASE_TTL_MS */
  public static final long SHADOW_LEASE_TTL_MS = 300_000L;

  /** Mirror CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS (= TTL / 2) */
  public static final long RENEW_INTERVAL_MS = SHADOW_LEASE_TTL_MS / 2;

  public interface RenewCallback {
    void onDone(boolean ok, int status, String error);
  }

  public interface RenewTransport {
    void renew(Context app, String callId, RenewCallback callback);
  }

  public interface LiveGate {
    /** True only while this session is still Native CONNECTED / renew-eligible. */
    boolean isRenewLive(String callId);
  }

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final AtomicInteger GENERATION = new AtomicInteger(0);

  private static String activeCallId = null;
  private static int activeGeneration = 0;
  private static Runnable pendingSparse = null;
  private static RenewTransport transport = null;
  private static LiveGate liveGate = null;
  private static Context appContext = null;
  private static int renewCountForTests = 0;

  private NativePresenceLeaseRenewOwner() {}

  public static void start(
      Context context, String callId, RenewTransport renewTransport, LiveGate gate) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    if (renewTransport == null || gate == null) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    int gen;
    synchronized (LOCK) {
      clearPendingLocked("replace_before_start");
      activeCallId = sid;
      activeGeneration = GENERATION.incrementAndGet();
      gen = activeGeneration;
      transport = renewTransport;
      liveGate = gate;
      appContext = app;
      renewCountForTests = 0;
    }
    Log.i(TAG, "presence_renew_start callId=" + sid + " intervalMs=" + RENEW_INTERVAL_MS);
    fireRenew(app, sid, gen, "immediate_connected");
  }

  public static void stop(String callId, String reason) {
    String sid = callId != null ? callId.trim() : "";
    synchronized (LOCK) {
      if (sid.isEmpty() || activeCallId == null || !sid.equals(activeCallId)) {
        return;
      }
      Log.i(TAG, "presence_renew_stop callId=" + sid + " reason=" + safe(reason));
      clearPendingLocked(reason);
      activeCallId = null;
      activeGeneration = GENERATION.incrementAndGet();
      transport = null;
      liveGate = null;
      appContext = null;
    }
  }

  public static boolean isActiveForTests(String callId) {
    synchronized (LOCK) {
      return callId != null && callId.trim().equals(activeCallId);
    }
  }

  public static int renewCountForTests() {
    synchronized (LOCK) {
      return renewCountForTests;
    }
  }

  public static void resetForTests() {
    synchronized (LOCK) {
      clearPendingLocked("reset_for_tests");
      activeCallId = null;
      activeGeneration = GENERATION.incrementAndGet();
      transport = null;
      liveGate = null;
      appContext = null;
      renewCountForTests = 0;
    }
  }

  /** Advance sparse timer for Robolectric tests. */
  public static void flushSparseForTests() {
    Runnable next;
    synchronized (LOCK) {
      next = pendingSparse;
    }
    if (next != null) {
      MAIN.removeCallbacks(next);
      next.run();
    }
  }

  private static void fireRenew(Context app, String sid, int gen, String source) {
    RenewTransport t;
    LiveGate gate;
    synchronized (LOCK) {
      if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) {
        return;
      }
      t = transport;
      gate = liveGate;
    }
    if (t == null || gate == null) return;
    if (!gate.isRenewLive(sid)) {
      stop(sid, "not_live_gate");
      return;
    }
    t.renew(
        app,
        sid,
        (ok, status, error) -> {
          synchronized (LOCK) {
            if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) {
              return;
            }
            renewCountForTests += 1;
          }
          if (!ok) {
            String err = error != null ? error : "";
            if ("not_live".equals(err) || err.contains("not_live")) {
              stop(sid, "server_not_live");
              return;
            }
            // Transient network: keep sparse schedule if still live
            Log.w(TAG, "presence_renew_failed callId=" + sid + " err=" + err + " source=" + source);
          } else {
            Log.i(TAG, "presence_renew_ok callId=" + sid + " source=" + source);
          }
          scheduleSparse(app, sid, gen);
        });
  }

  private static void scheduleSparse(Context app, String sid, int gen) {
    synchronized (LOCK) {
      if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) {
        return;
      }
      clearPendingLocked("reschedule");
      Runnable runnable =
          () -> {
            synchronized (LOCK) {
              if (activeCallId == null || !sid.equals(activeCallId) || gen != activeGeneration) {
                return;
              }
              pendingSparse = null;
            }
            fireRenew(app, sid, gen, "sparse");
          };
      pendingSparse = runnable;
      MAIN.postDelayed(runnable, RENEW_INTERVAL_MS);
    }
  }

  private static void clearPendingLocked(String reason) {
    if (pendingSparse != null) {
      MAIN.removeCallbacks(pendingSparse);
      pendingSparse = null;
    }
  }

  private static String safe(String value) {
    return value == null ? "" : value.trim();
  }
}
