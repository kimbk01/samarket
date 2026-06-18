package com.dibay.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

/** Foreground incoming — WebView autoplay 대신 OS 벨을 직접 재생한다. */
public final class DibayForegroundRingtone {
  private static final String TAG = "DIBAY_CALL";
  private static Ringtone active;

  private DibayForegroundRingtone() {}

  public static void start(Context context, String callId, String source, long timestampMs) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    boolean keyguardLocked = DibayKeyguardHelper.isKeyguardLocked(app);
    if (keyguardLocked || !DibayKeyguardHelper.isInteractive(app)) {
      IncomingCallWakeLock.acquire(app, callId);
    }
    stop(null, null, -1L, null);
    try {
      Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
      if (uri == null) return;
      Ringtone ringtone = RingtoneManager.getRingtone(context.getApplicationContext(), uri);
      if (ringtone == null) return;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        AudioAttributes.Builder attrs =
            new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          attrs.setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING);
        } else {
          attrs.setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE);
        }
        ringtone.setAudioAttributes(attrs.build());
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ringtone.setLooping(true);
      }
      ringtone.play();
      active = ringtone;
      String sid = callId != null ? callId.trim() : "";
      String src = source != null ? source : "native_foreground";
      Log.i(
          TAG,
          "[DIBAY_CALL] ring_start callId="
              + sid
              + " source="
              + src
              + " timestamp="
              + timestampMs);
    } catch (Exception e) {
      Log.w(TAG, "[DIBAY_CALL] ring_start_failed err=" + e.getMessage());
    }
  }

  public static void stop(String callId, String reason, long elapsedMsFromStart, String stopCaller) {
    if (active == null) return;
    try {
      active.stop();
    } catch (Exception ignored) {
    }
    active = null;
    if (callId != null && !callId.trim().isEmpty()) {
      String sid = callId.trim();
      String r = reason != null ? reason : "app_shutdown_safe_clear";
      String caller = stopCaller != null ? stopCaller : "native_foreground";
      if (elapsedMsFromStart >= 0L
          && elapsedMsFromStart < IncomingCallCleanupReason.earlyRingStopAllowedMs()) {
        IncomingCallCleanupReason cr = IncomingCallCleanupReason.fromWire(r);
        if (cr == null || !cr.allowsEarlyRingStop()) {
          Log.e(
              TAG,
              "[DIBAY_CALL] ring_stop_early_failure callId="
                  + sid
                  + " reason="
                  + r
                  + " elapsedMsFromStart="
                  + elapsedMsFromStart
                  + " stopCaller="
                  + caller);
        }
      }
      Log.i(
          TAG,
          "[DIBAY_CALL] ring_stop callId="
              + sid
              + " reason="
              + r
              + " elapsedMsFromStart="
              + elapsedMsFromStart
              + " stopCaller="
              + caller);
    }
  }
}
