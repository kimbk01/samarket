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
  private static Ringtone active;
  private static MediaPlayer activePlayer;

  private DibayForegroundRingtone() {}

  public static void start(Context context, String callId) {
    start(context, callId, null);
  }

  public static void start(Context context, String callId, String ringtoneUrl) {
    if (context == null) return;
    stop(null);
    String sid = callId != null ? callId.trim() : "";
    Context app = context.getApplicationContext();
    if (ringtoneUrl != null && !ringtoneUrl.trim().isEmpty()) {
      if (startAdminRingtone(app, sid, ringtoneUrl.trim())) {
        return;
      }
    }
    startDefaultRingtone(app, sid);
  }

  private static AudioAttributes buildRingAudioAttributes() {
    int usage =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
            : AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
    return new AudioAttributes.Builder()
        .setUsage(usage)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
  }

  private static boolean startAdminRingtone(Context app, String callId, String ringtoneUrl) {
    try {
      Uri uri = Uri.parse(ringtoneUrl);
      String scheme = uri != null ? uri.getScheme() : null;
      boolean remote = "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
      boolean local = "file".equalsIgnoreCase(scheme) || "content".equalsIgnoreCase(scheme);
      if (!remote && !local) {
        Log.w(
            TAG,
            "[DIBAY_CALL] native_call_ringtone_admin_play_failed_fallback callId="
                + callId
                + " reason=unsupported_uri_scheme");
        return false;
      }

      MediaPlayer player = new MediaPlayer();
      player.setAudioAttributes(buildRingAudioAttributes());
      player.setLooping(true);
      if (remote) {
        player.setDataSource(ringtoneUrl);
      } else {
        player.setDataSource(app, uri);
      }
      player.setOnPreparedListener(
          prepared -> {
            try {
              prepared.start();
              Log.i(
                  TAG,
                  "[DIBAY_CALL] native_call_ringtone_admin_play_success callId=" + callId);
              DibayCallLog.once("ring_start", callId, "source=native_foreground_admin_url");
            } catch (Exception e) {
              Log.w(
                  TAG,
                  "[DIBAY_CALL] native_call_ringtone_admin_play_failed_fallback callId="
                      + callId
                      + " err="
                      + e.getMessage());
              releasePlayer();
              startDefaultRingtone(app, callId);
            }
          });
      player.setOnErrorListener(
          (mp, what, extra) -> {
            Log.w(
                TAG,
                "[DIBAY_CALL] native_call_ringtone_admin_play_failed_fallback callId="
                    + callId
                    + " what="
                    + what
                    + " extra="
                    + extra);
            releasePlayer();
            startDefaultRingtone(app, callId);
            return true;
          });
      activePlayer = player;
      Log.i(TAG, "[DIBAY_CALL] native_call_ringtone_admin_play_start callId=" + callId);
      player.prepareAsync();
      return true;
    } catch (Exception e) {
      Log.w(
          TAG,
          "[DIBAY_CALL] native_call_ringtone_admin_play_failed_fallback callId="
              + callId
              + " err="
              + e.getMessage());
      releasePlayer();
      return false;
    }
  }

  private static void startDefaultRingtone(Context app, String callId) {
    try {
      Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
      if (uri == null) return;
      Ringtone ringtone = RingtoneManager.getRingtone(app, uri);
      if (ringtone == null) return;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        ringtone.setAudioAttributes(buildRingAudioAttributes());
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ringtone.setLooping(true);
      }
      ringtone.play();
      active = ringtone;
      Log.i(TAG, "[DIBAY_CALL] native_call_ringtone_default_fallback callId=" + callId);
      DibayCallLog.once("ring_start", callId, "source=native_foreground");
    } catch (Exception e) {
      Log.w(TAG, "[DIBAY_CALL] ring_start_failed err=" + e.getMessage());
    }
  }

  public static void stop(String callId) {
    boolean playerReleased = releasePlayer();
    boolean ringtoneReleased = releaseRingtone();
    boolean released = playerReleased || ringtoneReleased;
    if (callId != null && !callId.trim().isEmpty()) {
      String sid = callId.trim();
      DibayCallLog.once("ring_stop", sid, "source=native_foreground");
      Log.i(TAG, "[DIBAY_CALL] native_call_ringtone_stop_release callId=" + sid);
    } else if (released) {
      Log.i(TAG, "[DIBAY_CALL] native_call_ringtone_stop_release callId=");
    }
  }

  private static boolean releaseRingtone() {
    if (active == null) return false;
    try {
      active.stop();
    } catch (Exception ignored) {
    }
    active = null;
    return true;
  }

  private static boolean releasePlayer() {
    if (activePlayer == null) return false;
    try {
      if (activePlayer.isPlaying()) {
        activePlayer.stop();
      }
    } catch (Exception ignored) {
    }
    try {
      activePlayer.reset();
    } catch (Exception ignored) {
    }
    try {
      activePlayer.release();
    } catch (Exception ignored) {
    }
    activePlayer = null;
    return true;
  }
}
