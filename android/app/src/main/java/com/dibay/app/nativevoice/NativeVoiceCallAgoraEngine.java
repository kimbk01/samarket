package com.dibay.app.nativevoice;

import android.content.Context;
import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;

/**
 * Agora Android SDK wrapper for Native Voice Runtime.
 *
 * <p>Same-channel camera publish / voice-only downgrade without leave/rejoin (Engine media only).
 */
public final class NativeVoiceCallAgoraEngine {
  public interface Listener {
    void onConnected();

    void onDisconnected(String reason);

    void onError(String reason);
  }

  private static final Object LOCK = new Object();
  private static RtcEngine engine;
  private static String activeCallId;
  private static Listener listener;
  private static boolean callerJoinActive;

  private NativeVoiceCallAgoraEngine() {}

  public static void join(
      Context context, String callId, NativeVoiceCallApi.TokenConnection token, Listener nextListener) {
    joinInternal(context, callId, token, nextListener, false);
  }

  public static void joinCaller(
      Context context, String callId, NativeVoiceCallApi.TokenConnection token, Listener nextListener) {
    joinInternal(context, callId, token, nextListener, true);
  }

  private static void joinInternal(
      Context context,
      String callId,
      NativeVoiceCallApi.TokenConnection token,
      Listener nextListener,
      boolean caller) {
    if (context == null || callId == null || token == null) return;
    String sid = callId.trim();
    if (sid.isEmpty()) return;
    Context app = context.getApplicationContext();
    synchronized (LOCK) {
      listener = nextListener;
      activeCallId = sid;
      callerJoinActive = caller;
    }
    if (caller) {
      NativeVoiceCallLog.info("caller_agora_native_join_start", sid, "channel=" + token.channelName);
    } else {
      NativeVoiceCallLog.info("agora_native_join_start", sid, "channel=" + token.channelName);
    }
    new Thread(
            () -> {
              try {
                RtcEngine rtc = ensureEngine(app, token.appId);
                rtc.enableAudio();
                rtc.disableVideo();
                rtc.setDefaultAudioRoutetoSpeakerphone(false);
                NativeVoiceCallLog.info("audio_route_applied", sid, "speaker=false");

                ChannelMediaOptions options = new ChannelMediaOptions();
                options.channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION;
                options.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
                options.autoSubscribeAudio = true;
                options.autoSubscribeVideo = false;
                options.publishMicrophoneTrack = true;
                options.publishCameraTrack = false;
                if (caller) {
                  NativeVoiceCallLog.info("local_audio_publish_success", sid);
                }
                int result =
                    rtc.joinChannelWithUserAccount(
                        token.token != null ? token.token : "",
                        token.channelName,
                        token.uid,
                        options);
                if (result != 0) {
                  fail(sid, "join_return=" + result);
                }
              } catch (Exception error) {
                fail(sid, error.getClass().getSimpleName());
              }
            })
        .start();
  }

  public static void setSpeakerEnabled(boolean enabled) {
    synchronized (LOCK) {
      if (engine == null || activeCallId == null) return;
      engine.setEnableSpeakerphone(enabled);
      NativeVoiceCallLog.info("speaker_toggle", activeCallId, "enabled=" + enabled);
      NativeVoiceCallLog.info("audio_route_applied", activeCallId, "speaker=" + enabled);
    }
  }

  /**
   * Publish camera in-place on the active voice channel. No leaveChannel / joinChannel*.
   *
   * @return true only when enableVideo, startPreview, and updateChannelMediaOptions all return 0
   */
  public static boolean publishCameraInPlace(String callId) {
    RtcEngine rtc = engineForActiveCallOrNull(callId, "upgrade_video_skip");
    if (rtc == null) return false;
    String sid = callId.trim();
    NativeVoiceCallLog.info("upgrade_video_start", sid, "path=in_place");
    try {
      int enableResult = rtc.enableVideo();
      NativeVoiceCallLog.info("upgrade_video_enable_ok", sid, "result=" + enableResult);
      if (enableResult != 0) return false;
      int previewResult = rtc.startPreview();
      NativeVoiceCallLog.info("upgrade_video_preview_ok", sid, "result=" + previewResult);
      if (previewResult != 0) return false;
      ChannelMediaOptions options = videoPublishOptions();
      int updateResult = rtc.updateChannelMediaOptions(options);
      NativeVoiceCallLog.info(
          "upgrade_video_update_options_ok",
          sid,
          "result=" + updateResult + " publishCameraTrack=true autoSubscribeVideo=true");
      if (updateResult != 0) return false;
      NativeVoiceCallLog.info("upgrade_video_publish_ok", sid, "path=in_place leave=0 join=0");
      return true;
    } catch (RuntimeException error) {
      NativeVoiceCallLog.warn(
          "upgrade_video_failed", sid, "reason=exception err=" + error.getClass().getSimpleName());
      return false;
    }
  }

  /**
   * Downgrade to voice-only on the same channel. No leaveChannel.
   *
   * @return true only when updateChannelMediaOptions and disableVideo both return 0; stopPreview is
   *     best-effort
   */
  public static boolean downgradeToVoiceOnlyInPlace(String callId) {
    RtcEngine rtc = engineForActiveCallOrNull(callId, "downgrade_voice_skip");
    if (rtc == null) return false;
    String sid = callId.trim();
    NativeVoiceCallLog.info("downgrade_voice_start", sid, "path=in_place");
    try {
      ChannelMediaOptions options = voiceOnlyOptions();
      int updateResult = rtc.updateChannelMediaOptions(options);
      NativeVoiceCallLog.info(
          "downgrade_voice_update_options_ok",
          sid,
          "result=" + updateResult + " publishCameraTrack=false autoSubscribeVideo=false");
      if (updateResult != 0) return false;
      try {
        rtc.stopPreview();
      } catch (RuntimeException error) {
        NativeVoiceCallLog.warn(
            "downgrade_voice_stop_preview_best_effort",
            sid,
            "err=" + error.getClass().getSimpleName());
      }
      int disableResult = rtc.disableVideo();
      NativeVoiceCallLog.info(
          "downgrade_voice_done", sid, "disableVideo=" + disableResult + " leave=0");
      if (disableResult != 0) return false;
      return true;
    } catch (RuntimeException error) {
      NativeVoiceCallLog.warn(
          "downgrade_voice_failed",
          sid,
          "reason=exception err=" + error.getClass().getSimpleName());
      return false;
    }
  }

  /** Guard-only: current Agora occupant callId, or null when unset. */
  public static String peekOccupantCallId() {
    synchronized (LOCK) {
      return activeCallId != null && !activeCallId.isEmpty() ? activeCallId : null;
    }
  }

  /**
   * Reclaim engine with no occupant (zombie). Does not touch engines bound to an active callId.
   *
   * @return true when a zombie engine was released
   */
  public static boolean releaseZombieEngine(String reason) {
    synchronized (LOCK) {
      if (engine == null) return false;
      if (activeCallId != null && !activeCallId.isEmpty()) return false;
      listener = null;
      try {
        engine.leaveChannel();
      } catch (RuntimeException error) {
        NativeVoiceCallLog.warn(
            "error_terminal", "unknown", "agora_zombie_leave=" + error.getClass().getSimpleName());
      }
      RtcEngine.destroy();
      engine = null;
      return true;
    }
  }

  public static void leave(String reason) {
    Listener currentListener;
    String sid;
    synchronized (LOCK) {
      currentListener = listener;
      sid = activeCallId;
      listener = null;
      activeCallId = null;
      callerJoinActive = false;
      if (engine != null) {
        engine.leaveChannel();
        RtcEngine.destroy();
        engine = null;
      }
    }
    if (currentListener != null && sid != null) {
      currentListener.onDisconnected(reason != null ? reason : "leave");
    }
  }

  private static RtcEngine engineForActiveCallOrNull(String callId, String skipMarker) {
    if (callId == null || callId.trim().isEmpty()) {
      NativeVoiceCallLog.warn(skipMarker, "unknown", "reason=empty_call_id");
      return null;
    }
    String sid = callId.trim();
    synchronized (LOCK) {
      if (engine == null) {
        NativeVoiceCallLog.warn(skipMarker, sid, "reason=engine_null");
        return null;
      }
      if (activeCallId == null || !sid.equals(activeCallId)) {
        NativeVoiceCallLog.warn(
            skipMarker,
            sid,
            "reason=call_id_mismatch active=" + (activeCallId != null ? activeCallId : "null"));
        return null;
      }
      return engine;
    }
  }

  private static ChannelMediaOptions voiceOnlyOptions() {
    ChannelMediaOptions options = new ChannelMediaOptions();
    options.channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION;
    options.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
    options.autoSubscribeAudio = true;
    options.autoSubscribeVideo = false;
    options.publishMicrophoneTrack = true;
    options.publishCameraTrack = false;
    return options;
  }

  private static ChannelMediaOptions videoPublishOptions() {
    ChannelMediaOptions options = voiceOnlyOptions();
    options.autoSubscribeVideo = true;
    options.publishCameraTrack = true;
    return options;
  }

  private static RtcEngine ensureEngine(Context context, String appId) throws Exception {
    synchronized (LOCK) {
      if (engine != null) return engine;
      RtcEngineConfig config = new RtcEngineConfig();
      config.mContext = context;
      config.mAppId = appId;
      config.mEventHandler = EVENT_HANDLER;
      engine = RtcEngine.create(config);
      engine.setChannelProfile(Constants.CHANNEL_PROFILE_COMMUNICATION);
      return engine;
    }
  }

  private static final IRtcEngineEventHandler EVENT_HANDLER =
      new IRtcEngineEventHandler() {
        @Override
        public void onJoinChannelSuccess(String channel, int uid, int elapsed) {
          Listener currentListener;
          String sid;
          boolean callerJoin;
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
            callerJoin = callerJoinActive;
          }
          if (sid != null) {
            NativeVoiceCallLog.info(
                "agora_native_join_success", sid, "channel=" + channel + " uid=" + uid);
          }
          if (callerJoin) {
            if (sid != null) {
              NativeVoiceCallLog.info("caller_agora_local_join_success", sid, "awaiting_remote_user");
            }
            return;
          }
          if (currentListener != null) currentListener.onConnected();
        }

        @Override
        public void onUserJoined(int uid, int elapsed) {
          Listener currentListener;
          String sid;
          boolean callerJoin;
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
            callerJoin = callerJoinActive;
          }
          if (!callerJoin || sid == null || uid == 0) return;
          NativeVoiceCallLog.info("remote_user_joined", sid, "uid=" + uid);
          if (currentListener != null) currentListener.onConnected();
        }

        @Override
        public void onError(int err) {
          Listener currentListener;
          String sid;
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
          }
          if (sid != null) NativeVoiceCallLog.warn("error_terminal", sid, "agora_error=" + err);
          if (currentListener != null) currentListener.onError("agora_error=" + err);
        }
      };

  private static void fail(String callId, String reason) {
    NativeVoiceCallLog.warn("error_terminal", callId, "reason=" + reason);
    Listener currentListener;
    synchronized (LOCK) {
      currentListener = listener;
    }
    if (currentListener != null) currentListener.onError(reason);
  }
}
