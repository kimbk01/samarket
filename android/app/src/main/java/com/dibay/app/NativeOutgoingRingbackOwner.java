package com.dibay.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.nativevideo.NativeVideoCallLane;
import com.dibay.app.nativevoice.NativeVoiceCallLane;

/**
 * Single owner for native outgoing ringback. Never owns incoming ringtone.
 *
 * <p>ROUTE CONTRACT (product lock): VOICE → receiver/earpiece; VIDEO → speaker; EXTERNAL →
 * preserve. Connected Agora routing is owned elsewhere — do not extend this class into RTC.
 */
public final class NativeOutgoingRingbackOwner {
  private static final String TAG = "DIBAY_CALL";
  private static final Object LOCK = new Object();
  /** Matches WebAudio outgoing cadence (~2s on / 4s cycle) — not OS ringtone. */
  private static final int DEFAULT_TONE_ON_MS = 2000;
  private static final int DEFAULT_TONE_CYCLE_MS = 4000;

  private static String activeCallId;
  private static String activeMediaType;
  private static MediaPlayer activePlayer;
  private static ToneGenerator activeTone;
  private static Handler toneHandler;
  private static Runnable tonePulse;
  private static int generation;
  private static Context ringbackAppContext;
  /** True when this owner applied setCommunicationDevice / legacy speakerphone for ringback. */
  private static boolean communicationRoutePinned;
  /** "earpiece" | "speaker" | null — last built-in route this owner pinned. */
  private static String pinnedBuiltInRoute;

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
          if (!isStillActive(sid, gen)) return;
          NativeMessengerCallSoundConfigFetcher.TonePolicy policy = selectPolicy(config, media);
          if (policy == null || !policy.enabled
              || IncomingCallRingtoneSsotCache.POLICY_SILENT.equals(policy.mode)) {
            Log.i(
                TAG,
                "[DIBAY_CALL] native_outgoing_ringback_silent callId="
                    + sid
                    + " mediaType="
                    + media
                    + " reason=admin_disabled");
            return;
          }
          if (IncomingCallRingtoneSsotCache.POLICY_CUSTOM.equals(policy.mode)
              && policy.url != null
              && !policy.url.trim().isEmpty()) {
            startPlayer(app, sid, media, policy.url.trim(), gen);
            return;
          }
          // default — synthetic dial cadence (WebAudio parity); never OS TYPE_RINGTONE
          startDefaultSyntheticRingback(app, sid, media, gen);
        });
  }

  public static void stop(String callId, String reason) {
    String sid = callId != null ? callId.trim() : "";
    synchronized (LOCK) {
      if (!sid.isEmpty() && activeCallId != null && !sid.equals(activeCallId)) return;
      if (activeCallId == null && activePlayer == null && activeTone == null) return;
      String stoppedId = activeCallId != null ? activeCallId : sid;
      releaseLocked(reason);
      Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_stop callId=" + safe(stoppedId) + " reason=" + safe(reason));
      Log.i(
          TAG,
          "[DIBAY_NATIVE_VIDEO] DIBAY_CALL_CORR callId="
              + safe(stoppedId)
              + " marker=RB6 wall_ms="
              + System.currentTimeMillis()
              + " event=explicit_stop reason="
              + safe(reason));
    }
  }

  private static void startDefaultSyntheticRingback(
      Context app, String callId, String mediaType, int gen) {
    if (!isStillActive(callId, gen)) return;
    try {
      // Route must be pinned BEFORE ToneGenerator so video speaker / voice receiver apply.
      pinRingbackBeforeStart(app, null, callId, mediaType);
      int stream = AudioManager.STREAM_VOICE_CALL;
      ToneGenerator tone = new ToneGenerator(stream, 60);
      Handler handler = new Handler(Looper.getMainLooper());
      final int toneType =
          "video".equals(mediaType) ? ToneGenerator.TONE_SUP_RINGTONE : ToneGenerator.TONE_SUP_DIAL;
      Runnable pulse =
          new Runnable() {
            @Override
            public void run() {
              if (!isStillActive(callId, gen)) return;
              try {
                tone.startTone(toneType, DEFAULT_TONE_ON_MS);
              } catch (Exception error) {
                Log.w(
                    TAG,
                    "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId="
                        + callId
                        + " reason=default_tone_failed mediaType="
                        + mediaType);
                stop(callId, "default_tone_failed");
                return;
              }
              handler.postDelayed(this, DEFAULT_TONE_CYCLE_MS);
            }
          };
      synchronized (LOCK) {
        if (!isStillActiveLocked(callId, gen)) {
          tone.release();
          return;
        }
        releaseToneLocked();
        activeTone = tone;
        toneHandler = handler;
        tonePulse = pulse;
      }
      Log.i(
          TAG,
          "[DIBAY_CALL] native_outgoing_ringback_start callId="
              + callId
              + " mediaType="
              + mediaType
              + " source=default_synthetic deduped=false");
      Log.i(
          TAG,
          "[DIBAY_NATIVE_VIDEO] DIBAY_CALL_CORR callId="
              + callId
              + " marker=RB1 wall_ms="
              + System.currentTimeMillis()
              + " event=tone_started source=default_synthetic");
      handler.post(pulse);
    } catch (Exception error) {
      Log.w(
          TAG,
          "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId="
              + callId
              + " reason=DEFAULT_RINGBACK_ASSET_BLOCKED mediaType="
              + mediaType);
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
              pinRingbackBeforeStart(app, prepared, callId, mediaType);
              prepared.start();
              Log.i(
                  TAG,
                  "[DIBAY_CALL] native_outgoing_ringback_start callId="
                      + callId
                      + " mediaType="
                      + mediaType
                      + " source=custom_url deduped=false");
              Log.i(
                  TAG,
                  "[DIBAY_NATIVE_VIDEO] DIBAY_CALL_CORR callId="
                      + callId
                      + " marker=RB1 wall_ms="
                      + System.currentTimeMillis()
                      + " event=player_started source=custom_url");
            } catch (Exception error) {
              Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + callId + " reason=start_failed mediaType=" + mediaType);
              // custom load fail → default synthetic
              startDefaultSyntheticRingback(app, callId, mediaType, gen);
            }
          });
      player.setOnErrorListener(
          (mp, what, extra) -> {
            Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + callId + " reason=player_error mediaType=" + mediaType);
            releasePrepared(mp);
            startDefaultSyntheticRingback(app, callId, mediaType, gen);
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

  /**
   * Pin built-in ringback route by media type before playback.
   *
   * <ul>
   *   <li>VOICE → earpiece / speakerphone OFF
   *   <li>VIDEO → speaker / speakerphone ON
   *   <li>EXTERNAL BT/wired → preserve (no override)
   * </ul>
   *
   * @param player may be null for ToneGenerator path (communication-device / speakerphone only)
   */
  private static void pinRingbackBeforeStart(
      Context app, MediaPlayer player, String callId, String mediaType) {
    AudioManager audioManager = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
    if (audioManager == null) {
      logRouteSkip(callId, mediaType, "audio_manager_missing");
      return;
    }
    if (hasExternalOutputDevice(audioManager)) {
      logRingbackRoute(callId, mediaType, "external");
      logRouteSkip(callId, mediaType, "external_output_active");
      return;
    }

    boolean video = "video".equals(mediaType);
    if (video) {
      pinSpeakerRoute(audioManager, player, callId);
    } else {
      pinEarpieceRoute(audioManager, player, callId);
    }
  }

  private static void pinEarpieceRoute(
      AudioManager audioManager, MediaPlayer player, String callId) {
    AudioDeviceInfo earpiece = findBuiltinEarpiece(audioManager);
    if (earpiece == null) {
      logRouteSkip(callId, "voice", "earpiece_unavailable");
      applyLegacySpeakerOffFallback(audioManager, callId);
      logRingbackRoute(callId, "voice", "earpiece");
      return;
    }

    boolean preferredApplied = false;
    if (player != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      preferredApplied = player.setPreferredDevice(earpiece);
      logRoutePin(callId, "preferredDevice", preferredApplied ? "ok" : "fail");
    }

    if (preferredApplied) {
      pinnedBuiltInRoute = "earpiece";
      logRingbackRoute(callId, "voice", "earpiece");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AudioDeviceInfo communicationEarpiece = findCommunicationEarpiece(audioManager);
      if (communicationEarpiece != null) {
        try {
          audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
          boolean applied = audioManager.setCommunicationDevice(communicationEarpiece);
          if (applied) {
            communicationRoutePinned = true;
            pinnedBuiltInRoute = "earpiece";
          }
          logRoutePin(callId, "setCommunicationDevice", applied ? "ok" : "fail");
        } catch (Exception error) {
          logRoutePin(callId, "setCommunicationDevice", "fail");
        }
        logRingbackRoute(callId, "voice", "earpiece");
        return;
      }
    }

    applyLegacySpeakerOffFallback(audioManager, callId);
    logRingbackRoute(callId, "voice", "earpiece");
  }

  private static void pinSpeakerRoute(
      AudioManager audioManager, MediaPlayer player, String callId) {
    AudioDeviceInfo speaker = findBuiltinSpeaker(audioManager);
    if (speaker == null) {
      logRouteSkip(callId, "video", "speaker_unavailable");
      applyLegacySpeakerOnFallback(audioManager, callId);
      logRingbackRoute(callId, "video", "speaker");
      return;
    }

    boolean preferredApplied = false;
    if (player != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      preferredApplied = player.setPreferredDevice(speaker);
      logRoutePin(callId, "preferredDevice", preferredApplied ? "ok" : "fail");
    }

    if (preferredApplied) {
      pinnedBuiltInRoute = "speaker";
      logRingbackRoute(callId, "video", "speaker");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AudioDeviceInfo communicationSpeaker = findCommunicationSpeaker(audioManager);
      if (communicationSpeaker != null) {
        try {
          audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
          boolean applied = audioManager.setCommunicationDevice(communicationSpeaker);
          if (applied) {
            communicationRoutePinned = true;
            pinnedBuiltInRoute = "speaker";
          }
          logRoutePin(callId, "setCommunicationDevice", applied ? "ok" : "fail");
        } catch (Exception error) {
          logRoutePin(callId, "setCommunicationDevice", "fail");
        }
        logRingbackRoute(callId, "video", "speaker");
        return;
      }
    }

    applyLegacySpeakerOnFallback(audioManager, callId);
    logRingbackRoute(callId, "video", "speaker");
  }

  @SuppressWarnings("deprecation")
  private static void applyLegacySpeakerOffFallback(AudioManager audioManager, String callId) {
    try {
      audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
      audioManager.setSpeakerphoneOn(false);
      communicationRoutePinned = true;
      pinnedBuiltInRoute = "earpiece";
      logRoutePin(callId, "setSpeakerphoneOn", "ok");
    } catch (Exception error) {
      logRoutePin(callId, "setSpeakerphoneOn", "fail");
    }
  }

  @SuppressWarnings("deprecation")
  private static void applyLegacySpeakerOnFallback(AudioManager audioManager, String callId) {
    try {
      audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
      audioManager.setSpeakerphoneOn(true);
      communicationRoutePinned = true;
      pinnedBuiltInRoute = "speaker";
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

  private static AudioDeviceInfo findBuiltinSpeaker(AudioManager audioManager) {
    if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
    for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
      if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return device;
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

  private static AudioDeviceInfo findCommunicationSpeaker(AudioManager audioManager) {
    if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null;
    for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
      if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return device;
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
    if (!communicationRoutePinned || app == null) {
      pinnedBuiltInRoute = null;
      return;
    }
    if ("connected".equals(reason)) {
      // Leave route for Agora connected ownership; clear our pin bookkeeping only.
      communicationRoutePinned = false;
      pinnedBuiltInRoute = null;
      return;
    }
    AudioManager audioManager = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
    if (audioManager != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        try {
          audioManager.clearCommunicationDevice();
        } catch (Exception ignored) {
        }
      }
      try {
        // Clear legacy speakerphone regardless of prior earpiece/speaker pin.
        audioManager.setSpeakerphoneOn(false);
      } catch (Exception ignored) {
      }
    }
    communicationRoutePinned = false;
    pinnedBuiltInRoute = null;
  }

  private static void logRingbackRoute(String callId, String mediaType, String route) {
    Log.i(
        TAG,
        "[DIBAY_CALL] ringback_route callId="
            + safe(callId)
            + " media="
            + safe(mediaType)
            + " route="
            + safe(route));
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

  private static void logRouteSkip(String callId, String mediaType, String reason) {
    Log.i(
        TAG,
        "[DIBAY_CALL] native_outgoing_ringback_route_skip callId="
            + safe(callId)
            + " media="
            + safe(mediaType)
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

  private static NativeMessengerCallSoundConfigFetcher.TonePolicy selectPolicy(
      NativeMessengerCallSoundConfigFetcher.Config config, String mediaType) {
    if (config == null) {
      return new NativeMessengerCallSoundConfigFetcher.TonePolicy(
          true,
          IncomingCallRingtoneSsotCache.POLICY_DEFAULT,
          null,
          "video".equals(mediaType) ? "call_outgoing_video" : "call_outgoing_voice");
    }
    return "video".equals(mediaType) ? config.videoOutgoing : config.voiceOutgoing;
  }

  private static String selectUrl(
      NativeMessengerCallSoundConfigFetcher.Config config, String mediaType) {
    NativeMessengerCallSoundConfigFetcher.TonePolicy policy = selectPolicy(config, mediaType);
    if (policy == null || policy.url == null || policy.url.trim().isEmpty()) return null;
    return policy.url.trim();
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
    releaseToneLocked();
    releasePlayerLocked();
    activeCallId = null;
    activeMediaType = null;
  }

  private static void releaseToneLocked() {
    if (toneHandler != null && tonePulse != null) {
      toneHandler.removeCallbacks(tonePulse);
    }
    toneHandler = null;
    tonePulse = null;
    if (activeTone != null) {
      try {
        activeTone.stopTone();
      } catch (Exception ignored) {
      }
      try {
        activeTone.release();
      } catch (Exception ignored) {
      }
      activeTone = null;
    }
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
    // Canonical lane helpers: audio → voice; only video is VIDEO.
    if (NativeVideoCallLane.isVideoMediaType(mediaType)) return "video";
    if (NativeVoiceCallLane.isVoiceMediaType(mediaType)) return "voice";
    String value = mediaType != null ? mediaType.trim().toLowerCase() : "";
    return "video".equals(value) ? "video" : "voice";
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
