package com.dibay.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

/** Single owner for native outgoing ringback. Never owns incoming ringtone. */
public final class NativeOutgoingRingbackOwner {
  private static final String TAG = "DIBAY_CALL";
  private static final Object LOCK = new Object();

  private static String activeCallId;
  private static String activeMediaType;
  private static MediaPlayer activePlayer;
  private static int generation;
  private static Context ringbackAppContext;
  private static boolean communicationRoutePinned;

  private NativeOutgoingRingbackOwner() {}

  public static void start(Context context, String callId, String mediaType) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    ringbackAppContext = app;
    String sid = callId.trim();
    String media = normalizeMediaType(mediaType);
    final int gen;
    synchronized (LOCK) {
      if (sid.equals(activeCallId)) {
        Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_start callId=" + sid + " mediaType=" + media + " deduped=true");
        return;
      }
      releaseLocked("replace");
      activeCallId = sid;
      activeMediaType = media;
      gen = ++generation;
    }

    NativeMessengerCallSoundConfigFetcher.fetchAsync(
        app,
        sid,
        config -> {
          String url = selectUrl(config, media);
          if (url == null) {
            if (isStillActive(sid, gen)) {
              Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + sid + " reason=no_outgoing_url mediaType=" + media);
            }
            return;
          }
          startPlayer(app, sid, media, url, gen);
        });
  }

  public static void stop(String callId, String reason) {
    String sid = callId != null ? callId.trim() : "";
    synchronized (LOCK) {
      if (!sid.isEmpty() && activeCallId != null && !sid.equals(activeCallId)) return;
      if (activeCallId == null && activePlayer == null) return;
      String stoppedId = activeCallId != null ? activeCallId : sid;
      releaseLocked(reason);
      Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_stop callId=" + safe(stoppedId) + " reason=" + safe(reason));
    }
  }

  private static void startPlayer(Context app, String callId, String mediaType, String ringbackUrl, int gen) {
    if (!isStillActive(callId, gen)) return;
    try {
      Uri uri = Uri.parse(ringbackUrl);
      String scheme = uri != null ? uri.getScheme() : null;
      boolean remote = "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
      boolean local = "file".equalsIgnoreCase(scheme) || "content".equalsIgnoreCase(scheme);
      if (!remote && !local) {
        Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + callId + " reason=unsupported_uri_scheme mediaType=" + mediaType);
        return;
      }

      MediaPlayer player = new MediaPlayer();
      player.setAudioAttributes(buildRingbackAudioAttributes());
      player.setLooping(true);
      if (remote) {
        player.setDataSource(ringbackUrl);
      } else {
        player.setDataSource(app, uri);
      }
      player.setOnPreparedListener(
          prepared -> {
            if (!isStillActive(callId, gen)) {
              releasePrepared(prepared);
              return;
            }
            try {
              pinRingbackBeforeStart(app, prepared, callId);
              prepared.start();
              Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_start callId=" + callId + " mediaType=" + mediaType + " deduped=false");
            } catch (Exception error) {
              Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + callId + " reason=start_failed mediaType=" + mediaType);
              stop(callId, "start_failed");
            }
          });
      player.setOnErrorListener(
          (mp, what, extra) -> {
            Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + callId + " reason=player_error mediaType=" + mediaType);
            stop(callId, "player_error");
            return true;
          });
      synchronized (LOCK) {
        if (!isStillActiveLocked(callId, gen)) {
          releasePrepared(player);
          return;
        }
        releasePlayerLocked();
        activePlayer = player;
      }
      player.prepareAsync();
    } catch (Exception error) {
      Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + callId + " reason=" + safe(error.getClass().getSimpleName()) + " mediaType=" + mediaType);
      stop(callId, "prepare_failed");
    }
  }

  /** Prefer earpiece for ringback track before playback; never block call start on pin failure. */
  private static void pinRingbackBeforeStart(Context app, MediaPlayer player, String callId) {
    AudioManager audioManager = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
    if (audioManager == null) {
      logRouteSkip(callId, "audio_manager_missing");
      return;
    }
    if (hasExternalOutputDevice(audioManager)) {
      logRouteSkip(callId, "external_output_active");
      return;
    }

    AudioDeviceInfo earpiece = findBuiltinEarpiece(audioManager);
    if (earpiece == null) {
      logRouteSkip(callId, "earpiece_unavailable");
      return;
    }

    boolean preferredApplied = false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      preferredApplied = player.setPreferredDevice(earpiece);
      logRoutePin(callId, "preferredDevice", preferredApplied ? "ok" : "fail");
    }

    if (preferredApplied) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AudioDeviceInfo communicationEarpiece = findCommunicationEarpiece(audioManager);
      if (communicationEarpiece != null) {
        try {
          audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
          boolean applied = audioManager.setCommunicationDevice(communicationEarpiece);
          if (applied) {
            communicationRoutePinned = true;
          }
          logRoutePin(callId, "setCommunicationDevice", applied ? "ok" : "fail");
        } catch (Exception error) {
          logRoutePin(callId, "setCommunicationDevice", "fail");
        }
        return;
      }
    }

    applyLegacySpeakerOffFallback(audioManager, callId);
  }

  @SuppressWarnings("deprecation")
  private static void applyLegacySpeakerOffFallback(AudioManager audioManager, String callId) {
    try {
      audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
      audioManager.setSpeakerphoneOn(false);
      logRoutePin(callId, "setSpeakerphoneOn", "ok");
    } catch (Exception error) {
      logRoutePin(callId, "setSpeakerphoneOn", "fail");
    }
  }

  private static AudioDeviceInfo findBuiltinEarpiece(AudioManager audioManager) {
    if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
    for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
      if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return device;
    }
    return null;
  }

  private static AudioDeviceInfo findCommunicationEarpiece(AudioManager audioManager) {
    if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null;
    for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
      if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return device;
    }
    return null;
  }

  @SuppressWarnings("deprecation")
  private static boolean hasExternalOutputDevice(AudioManager audioManager) {
    if (audioManager == null) return false;
    if (audioManager.isBluetoothScoOn() || audioManager.isBluetoothA2dpOn()) return true;
    if (audioManager.isWiredHeadsetOn()) return true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
        int type = device.getType();
        if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET
            || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
            || type == AudioDeviceInfo.TYPE_USB_HEADSET
            || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
            || type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
          return true;
        }
      }
    }
    return false;
  }

  private static void releasePinnedCommunicationRoute(Context app, String reason) {
    if (!communicationRoutePinned || app == null) return;
    if ("connected".equals(reason)) {
      communicationRoutePinned = false;
      return;
    }
    AudioManager audioManager = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
    if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        audioManager.clearCommunicationDevice();
      } catch (Exception ignored) {
      }
    }
    communicationRoutePinned = false;
  }

  private static void logRoutePin(String callId, String api, String result) {
    Log.i(
        TAG,
        "[DIBAY_CALL] native_outgoing_ringback_route_pin callId="
            + safe(callId)
            + " api="
            + api
            + " result="
            + result);
  }

  private static void logRouteSkip(String callId, String reason) {
    Log.i(
        TAG,
        "[DIBAY_CALL] native_outgoing_ringback_route_skip callId="
            + safe(callId)
            + " reason="
            + safe(reason));
  }

  private static AudioAttributes buildRingbackAudioAttributes() {
    int usage =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
            : AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
    return new AudioAttributes.Builder()
        .setUsage(usage)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
  }

  private static String selectUrl(
      NativeMessengerCallSoundConfigFetcher.Config config, String mediaType) {
    if (config == null) return null;
    String url =
        "video".equals(mediaType)
            ? config.videoOutgoingRingbackUrl
            : config.voiceOutgoingRingbackUrl;
    return url != null && !url.trim().isEmpty() ? url.trim() : null;
  }

  private static boolean isStillActive(String callId, int gen) {
    synchronized (LOCK) {
      return isStillActiveLocked(callId, gen);
    }
  }

  private static boolean isStillActiveLocked(String callId, int gen) {
    return gen == generation && callId != null && callId.equals(activeCallId);
  }

  private static void releaseLocked(String reason) {
    generation += 1;
    Context app = ringbackAppContext;
    releasePinnedCommunicationRoute(app, reason);
    releasePlayerLocked();
    activeCallId = null;
    activeMediaType = null;
  }

  private static void releasePlayerLocked() {
    if (activePlayer == null) return;
    releasePrepared(activePlayer);
    activePlayer = null;
  }

  private static void releasePrepared(MediaPlayer player) {
    if (player == null) return;
    try {
      if (player.isPlaying()) {
        player.stop();
      }
    } catch (Exception ignored) {
    }
    try {
      player.reset();
    } catch (Exception ignored) {
    }
    try {
      player.release();
    } catch (Exception ignored) {
    }
  }

  private static String normalizeMediaType(String mediaType) {
    String value = mediaType != null ? mediaType.trim().toLowerCase() : "";
    return "video".equals(value) ? "video" : "voice";
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
