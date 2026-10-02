package com.dibay.app.nativecall;

import android.util.Log;
import java.util.concurrent.CountDownLatch;

/**
 * WP-3 / NEW-29 — single process-wide lifecycle authority for the Agora {@code RtcEngine}.
 *
 * <p>The Agora SDK keeps ONE native engine per process and {@code RtcEngine.destroy()} is static: it
 * destroys that engine no matter which lane (voice/video) created it. Before WP-3 each lane wrapper
 * released "zombie" engines on its own thread while the other lane was already creating/joining,
 * so the async destroy tore down the new call's engine (Agora join_return=-7).
 *
 * <p>Contracts enforced here (all lanes: voice→video, video→voice, voice→voice, video→video):
 *
 * <ul>
 *   <li>A — while a release is in progress, no lane may create/reuse the engine or join.
 *   <li>B — a lane acquires ownership only after the in-progress release has completed.
 *   <li>C/D — {@code RtcEngine.destroy()} runs only for the current release token; a stale release
 *       can never run while a call owns the engine (acquire waits until the release completes).
 *   <li>Each completed release bumps {@link #currentEpoch()}; a lane must drop any engine reference
 *       obtained in an older epoch (it points at a destroyed native engine).
 * </ul>
 *
 * <p>Waiting is on the release-completion condition, never on elapsed time.
 */
public final class NativeAgoraEngineLifecycle {
  private static final String TAG = "DIBAY_NATIVE_CALL";

  public enum State {
    /** No call owns the engine (an engine object may still exist for reuse). */
    IDLE,
    /** A call owns the engine. */
    OWNED,
    /** Previous engine is being released (leaveChannel + destroy). */
    RELEASING
  }

  /** Result of {@link #beginRelease}. */
  public static final long RELEASE_REFUSED_OWNED = -1L;
  public static final long RELEASE_ALREADY_IN_PROGRESS = 0L;

  private static final Object LOCK = new Object();
  private static State state = State.IDLE;
  private static String ownerLane;
  private static String ownerCallId;
  private static long epoch = 0L;
  private static long releaseToken = 0L;
  private static long activeReleaseToken = 0L;
  private static CountDownLatch releaseDone;

  private NativeAgoraEngineLifecycle() {}

  /**
   * Ask to release (destroy) the engine because it has no occupant.
   *
   * @return a positive token when this caller must perform the release, {@link
   *     #RELEASE_ALREADY_IN_PROGRESS} when another release is running (caller must only drop its
   *     reference), or {@link #RELEASE_REFUSED_OWNED} when a live call owns the engine (caller must
   *     not destroy).
   */
  public static long beginRelease(String lane, String reason) {
    synchronized (LOCK) {
      if (state == State.OWNED) {
        log("engine_release_refused_owned", lane, "owner=" + ownerLane + ":" + ownerCallId + " reason=" + reason);
        return RELEASE_REFUSED_OWNED;
      }
      if (state == State.RELEASING) {
        log("engine_release_already_in_progress", lane, "token=" + activeReleaseToken + " reason=" + reason);
        return RELEASE_ALREADY_IN_PROGRESS;
      }
      state = State.RELEASING;
      activeReleaseToken = ++releaseToken;
      releaseDone = new CountDownLatch(1);
      log("engine_release_start", lane, "token=" + activeReleaseToken + " epoch=" + epoch + " reason=" + reason);
      return activeReleaseToken;
    }
  }

  /** Contract D: destroy only for the current release token. */
  public static boolean mayDestroy(long token) {
    synchronized (LOCK) {
      boolean ok = token > 0 && state == State.RELEASING && token == activeReleaseToken;
      if (!ok) {
        log("engine_destroy_skipped_stale", "-", "token=" + token + " active=" + activeReleaseToken + " state=" + state);
      }
      return ok;
    }
  }

  /** Marks the release complete (always call from the releasing thread's finally). */
  public static void completeRelease(long token, String lane) {
    CountDownLatch done = null;
    synchronized (LOCK) {
      if (token <= 0 || token != activeReleaseToken || state != State.RELEASING) {
        log("engine_release_complete_stale", lane, "token=" + token + " active=" + activeReleaseToken + " state=" + state);
        return;
      }
      epoch++;
      state = State.IDLE;
      activeReleaseToken = 0L;
      done = releaseDone;
      releaseDone = null;
      log("engine_release_complete", lane, "token=" + token + " epoch=" + epoch);
    }
    if (done != null) done.countDown();
  }

  /**
   * Contracts A/B: block (join worker thread only) until no release is in progress, then take
   * ownership for {@code callId}.
   *
   * @return the epoch the caller may use; an engine created in an older epoch must be discarded.
   */
  public static long awaitReleaseAndAcquire(String lane, String callId) throws InterruptedException {
    while (true) {
      CountDownLatch wait;
      synchronized (LOCK) {
        if (state != State.RELEASING) {
          if (state == State.OWNED && !(lane.equals(ownerLane) && callId.equals(ownerCallId))) {
            log("engine_owner_replaced", lane, "previous=" + ownerLane + ":" + ownerCallId + " next=" + callId);
          }
          state = State.OWNED;
          ownerLane = lane;
          ownerCallId = callId;
          log("engine_owner_acquired", lane, "callId=" + callId + " epoch=" + epoch);
          return epoch;
        }
        wait = releaseDone;
        log("engine_acquire_wait_release", lane, "callId=" + callId + " token=" + activeReleaseToken);
      }
      if (wait != null) wait.await();
      log("engine_acquire_release_observed", lane, "callId=" + callId);
    }
  }

  /** Called when a lane's call stops owning the engine (leave / failed join). */
  public static void releaseOwnership(String lane, String callId) {
    synchronized (LOCK) {
      if (state != State.OWNED) return;
      if (callId != null && ownerCallId != null && !callId.equals(ownerCallId)) {
        log("engine_owner_release_skip_foreign", lane, "callId=" + callId + " owner=" + ownerLane + ":" + ownerCallId);
        return;
      }
      log("engine_owner_released", lane, "callId=" + ownerCallId + " epoch=" + epoch);
      state = State.IDLE;
      ownerLane = null;
      ownerCallId = null;
    }
  }

  public static long currentEpoch() {
    synchronized (LOCK) {
      return epoch;
    }
  }

  public static State currentState() {
    synchronized (LOCK) {
      return state;
    }
  }

  public static String currentOwner() {
    synchronized (LOCK) {
      return state == State.OWNED ? ownerLane + ":" + ownerCallId : null;
    }
  }

  static void resetForTests() {
    CountDownLatch done;
    synchronized (LOCK) {
      done = releaseDone;
      state = State.IDLE;
      ownerLane = null;
      ownerCallId = null;
      epoch = 0L;
      releaseToken = 0L;
      activeReleaseToken = 0L;
      releaseDone = null;
    }
    if (done != null) done.countDown();
  }

  static volatile boolean logToConsoleForTests;

  private static void log(String marker, String lane, String details) {
    String line = "[" + TAG + "] " + marker + " lane=" + lane + " " + details;
    if (logToConsoleForTests) {
      System.out.println(line);
      return;
    }
    try {
      Log.i(TAG, line);
    } catch (RuntimeException ignored) {
      // Local JVM unit tests without android.util.Log.
    }
  }
}
