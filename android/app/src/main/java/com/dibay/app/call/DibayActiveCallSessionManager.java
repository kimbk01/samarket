package com.dibay.app.call;

import android.content.Context;
import android.util.Log;
import com.dibay.app.DibayCallLog;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * P4 Active Call Session SSOT — callId·phase·connected 단일 owner.
 * CallForegroundService는 FGS/notification; lifecycle 결정은 여기서.
 */
public final class DibayActiveCallSessionManager {
  private static final String TAG = "DIBAY_CALL";

  public static final String PHASE_IDLE = "IDLE";
  public static final String PHASE_ACCEPTED = "ACCEPTED";
  public static final String PHASE_JOINING_MEDIA = "JOINING_MEDIA";
  public static final String PHASE_CONNECTED = "CONNECTED";
  public static final String PHASE_BACKGROUNDED = "BACKGROUNDED";
  public static final String PHASE_SCREEN_OFF = "SCREEN_OFF_ACTIVE";
  public static final String PHASE_PIP = "PIP_ACTIVE";
  public static final String PHASE_REENTERING = "REENTERING";
  public static final String PHASE_RECONNECTING = "RECONNECTING";
  public static final String PHASE_LOCAL_ENDING = "LOCAL_ENDING";
  public static final String PHASE_REMOTE_ENDED = "REMOTE_ENDED";
  public static final String PHASE_CLEANED = "CLEANED";

  private static final Set<String> FORBIDDEN_CLEANUP =
      Set.of(
          "activity_destroyed",
          "webview_reload",
          "notification_dismissed",
          "screen_off",
          "backgrounded",
          "unknown",
          "app_swipe");

  private static final AtomicReference<String> ACTIVE_CALL_ID = new AtomicReference<>(null);
  private static final AtomicReference<String> PHASE = new AtomicReference<>(PHASE_IDLE);
  private static final AtomicReference<String> MEDIA_TYPE = new AtomicReference<>("voice");
  private static final AtomicBoolean CONNECTED = new AtomicBoolean(false);
  private static final AtomicBoolean SCREEN_OFF = new AtomicBoolean(false);
  private static final AtomicBoolean IN_PIP = new AtomicBoolean(false);
  private static final AtomicBoolean LOCAL_END_SENT = new AtomicBoolean(false);
  private static final AtomicBoolean REMOTE_END_RECEIVED = new AtomicBoolean(false);

  private DibayActiveCallSessionManager() {}

  public static String getActiveCallId() {
    String id = ACTIVE_CALL_ID.get();
    return id != null ? id : "";
  }

  public static String getPhase() {
    return PHASE.get();
  }

  public static String getMediaType() {
    return MEDIA_TYPE.get();
  }

  public static boolean isConnected() {
    return CONNECTED.get();
  }

  public static boolean isScreenOff() {
    return SCREEN_OFF.get();
  }

  public static void bindActiveCall(String callId, String mediaType, String phase) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    ACTIVE_CALL_ID.set(sid);
    MEDIA_TYPE.set(mediaType != null ? mediaType : "voice");
    transitionPhase(phase != null ? phase : PHASE_CONNECTED, "bind_active");
    if (PHASE_CONNECTED.equals(PHASE.get())) {
      CONNECTED.set(true);
      DibayCallLog.once("active_call_connected", sid, "media=" + MEDIA_TYPE.get());
    }
  }

  public static void transitionPhase(String nextPhase, String source) {
    if (nextPhase == null || nextPhase.isEmpty()) return;
    String prev = PHASE.get();
    if (prev.equals(nextPhase)) return;
    PHASE.set(nextPhase);
    if (PHASE_CONNECTED.equals(nextPhase)) {
      CONNECTED.set(true);
      String sid = ACTIVE_CALL_ID.get();
      if (sid != null) {
        DibayCallLog.once("active_call_connected", sid, "source=" + source);
      }
    }
    Log.i(TAG, "[DIBAY_CALL] active_call_phase " + prev + " -> " + nextPhase + " source=" + source);
  }

  public static void onAppForeground(Context context, String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return;
    SCREEN_OFF.set(false);
    DibayCallLog.once("active_call_resume_check", sid, "source=foreground");
    if (CONNECTED.get()) {
      transitionPhase(PHASE_REENTERING, "app_foreground");
      DibayCallLog.once("active_call_resume_found", sid, "source=foreground");
      transitionPhase(PHASE_CONNECTED, "reenter_complete");
      DibayCallLog.once("active_call_screen_restored", sid, "source=foreground");
    }
  }

  public static void onAppBackground(String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty() || !CONNECTED.get()) return;
    transitionPhase(PHASE_BACKGROUNDED, "app_background");
    DibayCallLog.once("call_lifecycle_background_keep_alive", sid, "phase=BACKGROUNDED");
  }

  public static void onScreenOff(String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty() || !CONNECTED.get()) return;
    SCREEN_OFF.set(true);
    transitionPhase(PHASE_SCREEN_OFF, "screen_off");
    DibayCallLog.once("call_lifecycle_screen_off_keep_alive", sid, "phase=SCREEN_OFF_ACTIVE");
  }

  public static void onScreenOn(String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return;
    SCREEN_OFF.set(false);
    if (CONNECTED.get()) {
      transitionPhase(PHASE_REENTERING, "screen_on");
      transitionPhase(PHASE_CONNECTED, "screen_on_complete");
    }
  }

  public static void onPipEntered(String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return;
    IN_PIP.set(true);
    transitionPhase(PHASE_PIP, "pip_enter");
    DibayCallLog.once("active_call_pip_entered", sid, "ok=true");
  }

  public static void onPipExited(String callId) {
    IN_PIP.set(false);
    if (CONNECTED.get()) {
      transitionPhase(PHASE_CONNECTED, "pip_exit");
    }
  }

  public static void onReconnecting(String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return;
    transitionPhase(PHASE_RECONNECTING, "network");
  }

  public static boolean canCleanup(String reason) {
    if (reason == null) return false;
    String r = reason.trim().toLowerCase();
    if (r.isEmpty()) return false;
    return !FORBIDDEN_CLEANUP.contains(r);
  }

  public static boolean requestCleanup(Context context, String callId, String reason) {
    return requestLocalCleanup(context, callId, reason);
  }

  public static boolean requestLocalCleanup(Context context, String callId, String reason) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return false;
    if (!canCleanup(reason)) {
      DibayCallLog.once("active_call_cleanup_blocked", sid, "reason=" + reason);
      Log.i(TAG, "[DIBAY_CALL] active_call_cleanup_blocked callId=" + sid + " reason=" + reason);
      return false;
    }
    transitionPhase(PHASE_LOCAL_ENDING, reason);
    DibayCallLog.once("active_call_cleanup", sid, "reason=" + reason);
    CallForegroundService.stop(context, sid, reason);
    clearSession();
    return true;
  }

  public static void onRemoteEnded(Context context, String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return;
    if (REMOTE_END_RECEIVED.getAndSet(true)) {
      DibayCallLog.once("remote_ended_received", sid, "duplicate=true");
      return;
    }
    DibayCallLog.once("remote_ended_received", sid, "duplicate=false");
    transitionPhase(PHASE_REMOTE_ENDED, "remote_ended");
    if (canCleanup("remote_ended")) {
      DibayCallLog.once("active_call_cleanup", sid, "reason=remote_ended");
      CallForegroundService.stop(context, sid, "remote_ended");
      clearSession();
    }
  }

  public static void onLocalEndNotified(String callId) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid == null || sid.isEmpty()) return;
    if (LOCAL_END_SENT.getAndSet(true)) return;
    DibayCallLog.once("local_end_notified_remote", sid, "ok=true");
  }

  public static void clearSession() {
    ACTIVE_CALL_ID.set(null);
    PHASE.set(PHASE_CLEANED);
    MEDIA_TYPE.set("voice");
    CONNECTED.set(false);
    SCREEN_OFF.set(false);
    IN_PIP.set(false);
    LOCAL_END_SENT.set(false);
    REMOTE_END_RECEIVED.set(false);
    PHASE.set(PHASE_IDLE);
  }

  public static void syncFromForegroundService(String callId, String kind) {
    if (callId == null || callId.trim().isEmpty()) return;
    bindActiveCall(callId, kind, PHASE_CONNECTED);
    DibayCallLog.once("active_call_foreground_service_started", callId.trim(), "media=" + kind);
  }
}
