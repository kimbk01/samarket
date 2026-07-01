package com.dibay.app.nativevideo;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceView;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;
import io.agora.rtc2.video.VideoCanvas;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

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
  private static final Set<Integer> REMOTE_SETUP_UIDS = ConcurrentHashMap.newKeySet();
  private static final Set<Integer> PENDING_REMOTE_UIDS = ConcurrentHashMap.newKeySet();
  private static RtcEngine engine;
  private static String activeCallId;
  private static Listener listener;
  private static Context renderContext;
  private static boolean callerJoinActive;
  private static volatile boolean remoteVideoRendered;

  private NativeVideoCallAgoraEngine() {}

  public static void join(
      Context context, String callId, NativeVideoCallApi.TokenConnection token, Listener nextListener) {
    joinInternal(context, callId, token, nextListener, false);
  }

  public static void joinCaller(
      Context context, String callId, NativeVideoCallApi.TokenConnection token, Listener nextListener) {
    joinInternal(context, callId, token, nextListener, true);
  }

  private static void joinInternal(
      Context context,
      String callId,
      NativeVideoCallApi.TokenConnection token,
      Listener nextListener,
      boolean caller) {
    if (context == null || callId == null || token == null) return;
    String sid = callId.trim();
    if (sid.isEmpty()) return;
    synchronized (LOCK) {
      listener = nextListener;
      activeCallId = sid;
      renderContext = context.getApplicationContext();
      callerJoinActive = caller;
      REMOTE_SETUP_UIDS.clear();
      PENDING_REMOTE_UIDS.clear();
      remoteVideoRendered = false;
    }
    if (caller) {
      NativeVideoCallLog.info("caller_agora_native_join_start", sid, "channel=" + token.channelName);
    } else {
      NativeVideoCallLog.info("agora_native_join_start", sid, "channel=" + token.channelName);
    }
    final boolean callerJoin = caller;
    new Thread(
            () -> {
              try {
                Context app = context.getApplicationContext();
                RtcEngine rtc = ensureEngine(app, token.appId);
                rtc.enableAudio();
                rtc.enableVideo();
                rtc.setDefaultAudioRoutetoSpeakerphone(true);
                NativeVideoCallLog.info("audio_route_applied", sid, "speaker=true");
                CountDownLatch previewReady = new CountDownLatch(1);
                final String[] previewError = {null};
                MAIN.post(
                    () -> {
                      try {
                        if (NativeVideoCallActivity.isShowing(sid)) {
                          SurfaceView local = new SurfaceView(app);
                          local.setZOrderMediaOverlay(true);
                          rtc.setupLocalVideo(new VideoCanvas(local, VideoCanvas.RENDER_MODE_HIDDEN, 0));
                          NativeVideoCallActivity.attachLocalView(sid, local);
                          rtc.startPreview();
                          if (callerJoin) {
                            NativeVideoCallLog.info("caller_local_camera_preview_started", sid);
                          } else {
                            NativeVideoCallLog.info("local_camera_preview_started", sid);
                          }
                        } else if (callerJoin) {
                          NativeVideoCallLog.info("no_ui_preview_skipped", sid);
                          rtc.startPreview();
                        }
                      } catch (RuntimeException error) {
                        previewError[0] = "local_preview=" + error.getClass().getSimpleName();
                      } finally {
                        previewReady.countDown();
                      }
                    });
                if (!previewReady.await(8, TimeUnit.SECONDS)) {
                  fail(sid, "preview_ready_timeout");
                  return;
                }
                if (previewError[0] != null) {
                  fail(sid, previewError[0]);
                  return;
                }

                ChannelMediaOptions options = new ChannelMediaOptions();
                options.channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION;
                options.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
                options.autoSubscribeAudio = true;
                options.autoSubscribeVideo = true;
                options.publishMicrophoneTrack = true;
                options.publishCameraTrack = true;
                if (callerJoin) {
                  NativeVideoCallLog.info("local_camera_publish_success", sid);
                }
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

  public static void onRemoteRenderSurfaceReady(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    synchronized (LOCK) {
      if (!sid.equals(activeCallId) || PENDING_REMOTE_UIDS.isEmpty()) return;
      for (Integer uid : PENDING_REMOTE_UIDS.toArray(new Integer[0])) {
        if (uid != null) scheduleRemoteVideoSetup(uid, sid);
      }
    }
  }

  public static void setCameraEnabled(boolean enabled) {
    synchronized (LOCK) {
      if (engine == null || activeCallId == null) return;
      engine.muteLocalVideoStream(!enabled);
      NativeVideoCallLog.info("camera_toggle", activeCallId, "enabled=" + enabled);
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
    RtcEngine engineToDestroy;
    synchronized (LOCK) {
      if (engine == null) return false;
      if (activeCallId != null && !activeCallId.isEmpty()) return false;
      listener = null;
      renderContext = null;
      REMOTE_SETUP_UIDS.clear();
      PENDING_REMOTE_UIDS.clear();
      remoteVideoRendered = false;
      engineToDestroy = engine;
      engine = null;
    }
    tearDownEngine(engineToDestroy, null);
    return true;
  }

  public static void leave(String reason) {
    Listener currentListener;
    String sid;
    RtcEngine engineToDestroy;
    synchronized (LOCK) {
      currentListener = listener;
      sid = activeCallId;
      listener = null;
      activeCallId = null;
      renderContext = null;
      callerJoinActive = false;
      REMOTE_SETUP_UIDS.clear();
      PENDING_REMOTE_UIDS.clear();
      remoteVideoRendered = false;
      engineToDestroy = engine;
      engine = null;
    }
    if (engineToDestroy != null) {
      tearDownEngine(engineToDestroy, sid);
    }
    if (currentListener != null && sid != null) {
      currentListener.onDisconnected(reason != null ? reason : "leave");
    }
  }

  /** Preview/surfaces are on the main thread; do not hold LOCK during Agora destroy. */
  private static void tearDownEngine(RtcEngine engineToDestroy, String sid) {
    Runnable teardown =
        () -> {
          try {
            NativeVideoCallActivity.clearVideoSurfaces(sid);
            engineToDestroy.stopPreview();
            engineToDestroy.leaveChannel();
            RtcEngine.destroy();
          } catch (RuntimeException error) {
            if (sid != null) {
              NativeVideoCallLog.warn(
                  "error_terminal", sid, "agora_leave=" + error.getClass().getSimpleName());
            }
          }
        };
    if (Looper.myLooper() == Looper.getMainLooper()) {
      teardown.run();
      return;
    }
    CountDownLatch latch = new CountDownLatch(1);
    MAIN.post(
        () -> {
          try {
            teardown.run();
          } finally {
            latch.countDown();
          }
        });
    try {
      latch.await(8, TimeUnit.SECONDS);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
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

  private static void scheduleRemoteVideoSetup(int uid, String sid) {
    MAIN.post(() -> setupRemoteVideo(uid, sid));
  }

  private static void setupRemoteVideo(int uid, String sid) {
    RtcEngine rtc;
    Context context;
    synchronized (LOCK) {
      rtc = engine;
      context = renderContext;
      if (!sid.equals(activeCallId)) return;
    }
    if (rtc == null || context == null || uid == 0) return;
    if (!REMOTE_SETUP_UIDS.add(uid)) return;

    if (!NativeVideoCallActivity.ensureVideoRootForRemoteRender(sid)) {
      PENDING_REMOTE_UIDS.add(uid);
      REMOTE_SETUP_UIDS.remove(uid);
      return;
    }
    PENDING_REMOTE_UIDS.remove(uid);

    try {
      NativeVideoCallLog.info("setup_remote_video", sid, "uid=" + uid);
      SurfaceView remote = new SurfaceView(context);
      rtc.setupRemoteVideo(new VideoCanvas(remote, VideoCanvas.RENDER_MODE_FIT, uid));
      NativeVideoCallActivity.attachRemoteView(sid, remote);
    } catch (RuntimeException error) {
      REMOTE_SETUP_UIDS.remove(uid);
      fail(sid, "setup_remote_video=" + error.getClass().getSimpleName());
    }
  }

  private static void markRemoteVideoRendered(int uid, String sid, String details) {
    Listener currentListener;
    synchronized (LOCK) {
      if (!sid.equals(activeCallId) || remoteVideoRendered) return;
      remoteVideoRendered = true;
      currentListener = listener;
    }
    NativeVideoCallLog.info("remote_video_render_ready", sid, "uid=" + uid + details);
    if (currentListener != null) currentListener.onRemoteVideoReady();
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
            NativeVideoCallLog.info(
                "agora_native_join_success", sid, "channel=" + channel + " uid=" + uid);
          }
          if (callerJoin) {
            if (sid != null) {
              NativeVideoCallLog.info("caller_agora_local_join_success", sid, "awaiting_remote_user");
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
          if (sid == null || uid == 0) return;
          NativeVideoCallLog.info("remote_user_joined", sid, "uid=" + uid);
          scheduleRemoteVideoSetup(uid, sid);
          if (callerJoin && currentListener != null) currentListener.onConnected();
        }

        @Override
        public void onRemoteVideoStateChanged(int uid, int state, int reason, int elapsed) {
          String sid;
          synchronized (LOCK) {
            sid = activeCallId;
          }
          if (sid == null || uid == 0) return;
          if (state == Constants.REMOTE_VIDEO_STATE_STARTING
              || state == Constants.REMOTE_VIDEO_STATE_DECODING) {
            scheduleRemoteVideoSetup(uid, sid);
          }
        }

        @Override
        public void onFirstRemoteVideoDecoded(int uid, int width, int height, int elapsed) {
          String sid;
          synchronized (LOCK) {
            sid = activeCallId;
          }
          if (sid == null || uid == 0) return;
          markRemoteVideoRendered(uid, sid, " width=" + width + " height=" + height);
        }

        @Override
        public void onFirstRemoteVideoFrame(int uid, int width, int height, int elapsed) {
          String sid;
          synchronized (LOCK) {
            sid = activeCallId;
          }
          if (sid == null || uid == 0) return;
          markRemoteVideoRendered(uid, sid, " width=" + width + " height=" + height);
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
