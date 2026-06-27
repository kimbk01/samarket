package com.dibay.app.nativevoice;

import android.content.Context;
import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;

/** Agora Android SDK wrapper for voice-only Native Runtime. */
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

  private NativeVoiceCallAgoraEngine() {}

  public static void join(
      Context context, String callId, NativeVoiceCallApi.TokenConnection token, Listener nextListener) {
    if (context == null || callId == null || token == null) return;
    String sid = callId.trim();
    if (sid.isEmpty()) return;
    synchronized (LOCK) {
      listener = nextListener;
      activeCallId = sid;
    }
    NativeVoiceCallLog.info("agora_native_join_start", sid, "channel=" + token.channelName);
    new Thread(
            () -> {
              try {
                RtcEngine rtc = ensureEngine(context.getApplicationContext(), token.appId);
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

  public static void leave(String reason) {
    Listener currentListener;
    String sid;
    synchronized (LOCK) {
      currentListener = listener;
      sid = activeCallId;
      listener = null;
      activeCallId = null;
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
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
          }
          if (sid != null) {
            NativeVoiceCallLog.info(
                "agora_native_join_success", sid, "channel=" + channel + " uid=" + uid);
          }
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
