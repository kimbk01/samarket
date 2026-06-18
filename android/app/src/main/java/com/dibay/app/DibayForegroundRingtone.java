package com.dibay.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

/** Incoming ring SSOT — notification channel stays silent to avoid double ring. */
public final class DibayForegroundRingtone {
  private static final String TAG = "DIBAY_CALL";
  private static Ringtone active;

  private DibayForegroundRingtone() {}

  public static void start(Context context, String callId) {
    if (context == null) return;
    stop(null);
    try {
      Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
      if (uri == null) return;
      Ringtone ringtone = RingtoneManager.getRingtone(context.getApplicationContext(), uri);
      if (ringtone == null) return;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        int usage =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                ? AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
                : AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
        ringtone.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ringtone.setLooping(true);
      }
      ringtone.play();
      active = ringtone;
      String sid = callId != null ? callId.trim() : "";
      DibayCallLog.once("ring_start", sid, "source=native_foreground");
    } catch (Exception e) {
      Log.w(TAG, "[DIBAY_CALL] ring_start_failed err=" + e.getMessage());
    }
  }

  public static void stop(String callId) {
    if (active == null) return;
    try {
      active.stop();
    } catch (Exception ignored) {
    }
    active = null;
    if (callId != null && !callId.trim().isEmpty()) {
      String sid = callId.trim();
      DibayCallLog.once("ring_stop", sid, "source=native_foreground");
    }
  }
}
