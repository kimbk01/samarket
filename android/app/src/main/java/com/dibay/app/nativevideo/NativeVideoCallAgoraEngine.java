package com.dibay.app.nativevideo;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceView;
import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;
import io.agora.rtc2.video.VideoCanvas;

/** Agora Android SDK wrapper for video Native Runtime. */
public final class NativeVideoCallAgoraEngine {
  public interface Listener {
    void onConnected();

    void onRemoteVideoReady();

    void onDisconnected(String reason);

    void onError(String reason);
  }

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static RtcEngine engine;
  private static String activeCallId;
  private static Listener listener;
  private static Context renderContext;

  private NativeVideoCallAgoraEngine() {}

  public static void join(
      Context context, String callId, NativeVideoCallApi.TokenConnection token, Listener nextListener) {
    if (context == null || callId == null || token == null) return;
    String sid = callId.trim();
    if (sid.isEmpty()) return;
    synchronized (LOCK) {
      listener = nextListener;
      activeCallId = sid;
      renderContext = context.getApplicationContext();
    }
    NativeVideoCallLog.info("agora_native_join_start", sid, "channel=" + token.channelName);
    new Thread(
            () -> {
              try {
                Context app = context.getApplicationContext();
                RtcEngine rtc = ensureEngine(app, token.appId);
                rtc.enableAudio();
                rtc.enableVideo();
                rtc.setDefaultAudioRoutetoSpeakerphone(true);
                NativeVideoCallLog.info("audio_route_applied", sid, "speaker=true");
                MAIN.post(
                    () -> {
                      try {
                        SurfaceView local = new SurfaceView(app);
                        local.setZOrderMediaOverlay(true);
                        rtc.setupLocalVideo(new VideoCanvas(local, VideoCanvas.RENDER_MODE_HIDDEN, 0));
                        NativeVideoCallActivity.attachLocalView(sid, local);
                        rtc.startPreview();
                        NativeVideoCallLog.info("local_camera_preview_started", sid);
                      } catch (RuntimeException error) {
                        fail(sid, "local_preview=" + error.getClass().getSimpleName());
                      }
                    });

                ChannelMediaOptions options = new ChannelMediaOptions();
                options.channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION;
                options.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
                options.autoSubscribeAudio = true;
                options.autoSubscribeVideo = true;
                options.publishMicrophoneTrack = true;
                options.publishCameraTrack = true;
                int result =
                    rtc.joinChannelWithUserAccount(
                        token.token != null ? token.token : "",
                        token.channelName,
                        token.uid,
                        options);
                if (result != 0) fail(sid, "join_return=" + result);
              } catch (Exception error) {
                fail(sid, error.getClass().getSimpleName());
              }
            })
        .start();
  }

  public static void setCameraEnabled(boolean enabled) {
    synchronized (LOCK) {
      if (engine == null || activeCallId == null) return;
      engine.muteLocalVideoStream(!enabled);
      NativeVideoCallLog.info("camera_toggle", activeCallId, "enabled=" + enabled);
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
      renderContext = null;
      if (engine != null) {
        engine.stopPreview();
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
            NativeVideoCallLog.info(
                "agora_native_join_success", sid, "channel=" + channel + " uid=" + uid);
          }
          if (currentListener != null) currentListener.onConnected();
        }

        @Override
        public void onUserJoined(int uid, int elapsed) {
          RtcEngine rtc;
          String sid;
          Context context;
          synchronized (LOCK) {
            rtc = engine;
            sid = activeCallId;
            context = renderContext;
          }
          if (rtc == null || sid == null || context == null) return;
          NativeVideoCallLog.info("remote_user_joined", sid, "uid=" + uid);
          Context app = context;
          MAIN.post(
              () -> {
                SurfaceView remote = new SurfaceView(app);
                rtc.setupRemoteVideo(new VideoCanvas(remote, VideoCanvas.RENDER_MODE_HIDDEN, uid));
                NativeVideoCallActivity.attachRemoteView(sid, remote);
              });
        }

        @Override
        public void onFirstRemoteVideoDecoded(int uid, int width, int height, int elapsed) {
          Listener currentListener;
          String sid;
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
          }
          if (sid != null) {
            NativeVideoCallLog.info(
                "remote_video_render_ready", sid, "uid=" + uid + " width=" + width + " height=" + height);
          }
          if (currentListener != null) currentListener.onRemoteVideoReady();
        }

        @Override
        public void onError(int err) {
          Listener currentListener;
          String sid;
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
          }
          if (sid != null) NativeVideoCallLog.warn("error_terminal", sid, "agora_error=" + err);
          if (currentListener != null) currentListener.onError("agora_error=" + err);
        }
      };

  private static void fail(String callId, String reason) {
    NativeVideoCallLog.warn("error_terminal", callId, "reason=" + reason);
    Listener currentListener;
    synchronized (LOCK) {
      currentListener = listener;
    }
    if (currentListener != null) currentListener.onError(reason);
  }
}
