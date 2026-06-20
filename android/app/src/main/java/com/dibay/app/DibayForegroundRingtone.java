package com.dibay.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

/** Incoming ring SSOT — notification channel stays silent to avoid double ring. */
public final class DibayForegroundRingtone {
  private static final String TAG = "DIBAY_CALL";
  private static Ringtone activeRingtone;
  private static MediaPlayer activePlayer;

  private DibayForegroundRingtone() {}

  public static void start(Context context, String callId, String callType) {
    if (context == null) return;
    stop(null);
    Context app = context.getApplicationContext();
    boolean isVideo = callType != null && "video".equalsIgnoreCase(callType.trim());
    MessengerCallSoundNativeConfig.IncomingSound cfg =
        MessengerCallSoundNativeConfig.resolveIncoming(app, isVideo);
    if (!cfg.enabled) {
      Log.i(TAG, "[DIBAY_CALL] ring_start_skipped_disabled callId=" + (callId != null ? callId : ""));
      return;
    }
    if ("admin_custom".equals(cfg.source) && cfg.url != null && !cfg.url.isEmpty()) {
      startCustomUrl(app, callId, cfg.url);
      return;
    }
    startDeviceRingtone(app, callId);
  }

  /** @deprecated use {@link #start(Context, String, String)} */
  public static void start(Context context, String callId) {
    start(context, callId, null);
  }

  private static void startDeviceRingtone(Context app, String callId) {
    try {
      Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
      if (uri == null) return;
      Ringtone ringtone = RingtoneManager.getRingtone(app, uri);
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
      activeRingtone = ringtone;
      String sid = callId != null ? callId.trim() : "";
      DibayCallLog.once("ring_start", sid, "source=native_device_ringtone");
    } catch (Exception e) {
      Log.w(TAG, "[DIBAY_CALL] ring_start_failed err=" + e.getMessage());
    }
  }

  private static void startCustomUrl(Context app, String callId, String url) {
    try {
      MediaPlayer player = new MediaPlayer();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        int usage =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                ? AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
                : AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
        player.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
      }
      player.setDataSource(url);
      player.setLooping(true);
      player.setOnPreparedListener(
          mp -> {
            try {
              mp.start();
            } catch (Exception e) {
              Log.w(TAG, "[DIBAY_CALL] ring_custom_start_failed err=" + e.getMessage());
            }
          });
      player.setOnErrorListener(
          (mp, what, extra) -> {
            Log.w(TAG, "[DIBAY_CALL] ring_custom_error what=" + what + " extra=" + extra);
            stop(null);
            startDeviceRingtone(app, callId);
            return true;
          });
      player.prepareAsync();
      activePlayer = player;
      String sid = callId != null ? callId.trim() : "";
      DibayCallLog.once("ring_start", sid, "source=native_admin_custom");
    } catch (Exception e) {
      Log.w(TAG, "[DIBAY_CALL] ring_custom_prepare_failed err=" + e.getMessage());
      startDeviceRingtone(app, callId);
    }
  }

  public static void stop(String callId) {
    if (activePlayer != null) {
      try {
        activePlayer.stop();
      } catch (Exception ignored) {
      }
      try {
        activePlayer.release();
      } catch (Exception ignored) {
      }
      activePlayer = null;
    }
    if (activeRingtone != null) {
      try {
        activeRingtone.stop();
      } catch (Exception ignored) {
      }
      activeRingtone = null;
    }
    if (callId != null && !callId.trim().isEmpty()) {
      String sid = callId.trim();
      DibayCallLog.once("ring_stop", sid, "source=native_foreground");
    }
  }
}
