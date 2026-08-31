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
import java.util.HashSet;
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

  public interface NetworkQualityObserver {
    void onNetworkQuality(int worstQuality, int txQuality, int rxQuality);
  }

  public enum RemoteReattachResult {
    SUCCESS,
    SKIPPED_INVALID_CALL_ID,
    SKIPPED_CALL_MISMATCH,
    SKIPPED_ENGINE_NULL,
    SKIPPED_NO_REMOTE_UID,
    SKIPPED_AMBIGUOUS_REMOTE_UID,
    SKIPPED_IN_FLIGHT,
    SKIPPED_NOT_MAIN_THREAD,
    FAILED_SETUP
  }

  public enum LocalReattachResult {
    SUCCESS,
    SKIPPED_INVALID_CALL_ID,
    SKIPPED_CALL_MISMATCH,
    SKIPPED_ENGINE_NULL,
    SKIPPED_CAMERA_DISABLED,
    SKIPPED_IN_FLIGHT,
    SKIPPED_NOT_MAIN_THREAD,
    FAILED_SETUP
  }

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final Set<Integer> REMOTE_SETUP_UIDS = ConcurrentHashMap.newKeySet();
  private static final Set<Integer> PENDING_REMOTE_UIDS = ConcurrentHashMap.newKeySet();
  private static RtcEngine engine;
  private static String activeCallId;
  private static Listener listener;
  private static NetworkQualityObserver networkQualityObserver;
  private static Context renderContext;
  private static boolean callerJoinActive;
  private static volatile boolean remoteVideoRendered;
  private static volatile String reattachInFlightCallId;
  private static volatile String localReattachInFlightCallId;

  private NativeVideoCallAgoraEngine() {}

  public static void setNetworkQualityObserver(NetworkQualityObserver observer) {
    synchronized (LOCK) {
      networkQualityObserver = observer;
    }
  }

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
      reattachInFlightCallId = null;
      localReattachInFlightCallId = null;
    }
    if (caller) {
      NativeVideoCallLog.info("caller_agora_native_join_start", sid, "channel=" + token.channelName);
      NativeVideoCallLog.corr("RB4", sid, "event=agora_join_start caller=true");
    } else {
      NativeVideoCallLog.info("agora_native_join_start", sid, "channel=" + token.channelName);
      NativeVideoCallLog.corr("I9", sid, "event=agora_join_start caller=false");
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
                if (callerJoin) {
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
                            NativeVideoCallLog.info("caller_local_camera_preview_started", sid);
                          } else {
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
                } else {
                  MAIN.post(
                      () -> {
                        try {
                          if (!NativeVideoCallActivity.isShowing(sid)) return;
                          SurfaceView local = new SurfaceView(app);
                          local.setZOrderMediaOverlay(true);
                          rtc.setupLocalVideo(new VideoCanvas(local, VideoCanvas.RENDER_MODE_HIDDEN, 0));
                          NativeVideoCallActivity.attachLocalView(sid, local);
                          rtc.startPreview();
                          NativeVideoCallLog.info("local_camera_preview_started", sid);
                        } catch (RuntimeException error) {
                          NativeVideoCallLog.warn(
                              "error_terminal",
                              sid,
                              "callee_local_preview_async=" + error.getClass().getSimpleName());
                        }
                      });
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

  /**
   * Recreates one remote SurfaceView for an active call after Activity destroy (e.g. Recents swipe +
   * notification restore). Does not leave/join or clear all setup uids.
   */
  public static RemoteReattachResult reattachRemoteSurfaceIfNeeded(String callId) {
    if (callId == null || callId.trim().isEmpty()) {
      return RemoteReattachResult.SKIPPED_INVALID_CALL_ID;
    }
    if (Looper.myLooper() != Looper.getMainLooper()) {
      return RemoteReattachResult.SKIPPED_NOT_MAIN_THREAD;
    }
    String sid = callId.trim();
    int remoteUid;
    synchronized (LOCK) {
      if (!sid.equals(activeCallId)) {
        logReattachSkipped(sid, "call_mismatch", REMOTE_SETUP_UIDS.size());
        return RemoteReattachResult.SKIPPED_CALL_MISMATCH;
      }
      if (engine == null) {
        logReattachSkipped(sid, "engine_null", REMOTE_SETUP_UIDS.size());
        return RemoteReattachResult.SKIPPED_ENGINE_NULL;
      }
      if (reattachInFlightCallId != null && sid.equals(reattachInFlightCallId)) {
        logReattachSkipped(sid, "in_flight", REMOTE_SETUP_UIDS.size());
        return RemoteReattachResult.SKIPPED_IN_FLIGHT;
      }
      Set<Integer> snapshot = new HashSet<>(REMOTE_SETUP_UIDS);
      if (snapshot.isEmpty()) {
        logReattachSkipped(sid, "no_remote_uid", 0);
        return RemoteReattachResult.SKIPPED_NO_REMOTE_UID;
      }
      if (snapshot.size() > 1) {
        logReattachSkipped(sid, "ambiguous_remote_uid", snapshot.size());
        return RemoteReattachResult.SKIPPED_AMBIGUOUS_REMOTE_UID;
      }
      Integer onlyUid = snapshot.iterator().next();
      if (onlyUid == null || onlyUid == 0) {
        logReattachSkipped(sid, "no_remote_uid", snapshot.size());
        return RemoteReattachResult.SKIPPED_NO_REMOTE_UID;
      }
      remoteUid = onlyUid;
      reattachInFlightCallId = sid;
      REMOTE_SETUP_UIDS.remove(remoteUid);
    }
    try {
      NativeVideoCallLog.info(
          "native_video_remote_reattach_setup_started",
          sid,
          "uid=" + remoteUid + " remoteUidCount=1");
      setupRemoteVideo(remoteUid, sid);
      if (NativeVideoCallActivity.hasRemoteSurfaceChild(sid)) {
        NativeVideoCallLog.info(
            "native_video_remote_reattach_surface_attached",
            sid,
            "uid=" + remoteUid + " remoteChildCount=1");
        return RemoteReattachResult.SUCCESS;
      }
      NativeVideoCallLog.warn(
          "native_video_remote_reattach_failed",
          sid,
          "uid=" + remoteUid + " reason=setup_no_surface");
      return RemoteReattachResult.FAILED_SETUP;
    } catch (RuntimeException error) {
      NativeVideoCallLog.warn(
          "native_video_remote_reattach_failed",
          sid,
          "uid=" + remoteUid + " err=" + error.getClass().getSimpleName());
      return RemoteReattachResult.FAILED_SETUP;
    } finally {
      synchronized (LOCK) {
        if (sid.equals(reattachInFlightCallId)) {
          reattachInFlightCallId = null;
        }
      }
    }
  }

  private static void logReattachSkipped(String callId, String reason, int remoteUidCount) {
    NativeVideoCallLog.info(
        "native_video_remote_reattach_skipped",
        callId,
        "reason=" + reason + " remoteUidCount=" + remoteUidCount);
  }

  /**
   * Rebinds local preview to a new Activity after destroy. Preview capture stays running; does not
   * call startPreview unless a future audit proves preview was stopped.
   */
  public static LocalReattachResult reattachLocalPreviewIfNeeded(String callId, boolean cameraEnabled) {
    if (callId == null || callId.trim().isEmpty()) {
      return LocalReattachResult.SKIPPED_INVALID_CALL_ID;
    }
    if (!cameraEnabled) {
      logLocalReattachSkipped(callId.trim(), "camera_disabled", false, 0);
      return LocalReattachResult.SKIPPED_CAMERA_DISABLED;
    }
    if (Looper.myLooper() != Looper.getMainLooper()) {
      return LocalReattachResult.SKIPPED_NOT_MAIN_THREAD;
    }
    String sid = callId.trim();
    RtcEngine rtc;
    Context context;
    synchronized (LOCK) {
      if (!sid.equals(activeCallId)) {
        logLocalReattachSkipped(sid, "call_mismatch", false, 0);
        return LocalReattachResult.SKIPPED_CALL_MISMATCH;
      }
      rtc = engine;
      context = renderContext;
      if (rtc == null || context == null) {
        logLocalReattachSkipped(sid, "engine_null", false, 0);
        return LocalReattachResult.SKIPPED_ENGINE_NULL;
      }
      if (localReattachInFlightCallId != null && sid.equals(localReattachInFlightCallId)) {
        logLocalReattachSkipped(sid, "in_flight", false, 0);
        return LocalReattachResult.SKIPPED_IN_FLIGHT;
      }
      localReattachInFlightCallId = sid;
    }
    try {
      // Activity destroy does not call stopPreview; only leave/tearDownEngine does (policy A).
      NativeVideoCallLog.info(
          "native_video_local_reattach_setup_started",
          sid,
          "cameraEnabled=true previewRunningKnown=true");
      SurfaceView local = new SurfaceView(context);
      local.setZOrderMediaOverlay(true);
      rtc.setupLocalVideo(new VideoCanvas(local, VideoCanvas.RENDER_MODE_HIDDEN, 0));
      NativeVideoCallActivity.attachLocalView(sid, local);
      if (NativeVideoCallActivity.hasLocalSurfaceChild(sid)) {
        NativeVideoCallLog.info(
            "native_video_local_reattach_surface_attached",
            sid,
            "cameraEnabled=true localChildCount=1 previewRunningKnown=true");
        return LocalReattachResult.SUCCESS;
      }
      NativeVideoCallLog.warn(
          "native_video_local_reattach_failed",
          sid,
          "cameraEnabled=true reason=setup_no_surface previewRunningKnown=true");
      return LocalReattachResult.FAILED_SETUP;
    } catch (RuntimeException error) {
      NativeVideoCallLog.warn(
          "native_video_local_reattach_failed",
          sid,
          "cameraEnabled=true err=" + error.getClass().getSimpleName() + " previewRunningKnown=true");
      return LocalReattachResult.FAILED_SETUP;
    } finally {
      synchronized (LOCK) {
        if (sid.equals(localReattachInFlightCallId)) {
          localReattachInFlightCallId = null;
        }
      }
    }
  }

  private static void logLocalReattachSkipped(
      String callId, String reason, boolean cameraEnabled, int localChildCount) {
    NativeVideoCallLog.info(
        "native_video_local_reattach_skipped",
        callId,
        "reason="
            + reason
            + " cameraEnabled="
            + cameraEnabled
            + " localChildCount="
            + localChildCount
            + " previewRunningKnown=true");
  }

  public static void setCameraEnabled(boolean enabled) {
    synchronized (LOCK) {
      if (engine == null || activeCallId == null) return;
      engine.muteLocalVideoStream(!enabled);
      NativeVideoCallLog.info("camera_toggle", activeCallId, "enabled=" + enabled);
    }
  }

  public static boolean setMicMuted(boolean muted) {
    synchronized (LOCK) {
      if (engine == null || activeCallId == null) return false;
      int result = engine.muteLocalAudioStream(muted);
      NativeVideoCallLog.info(
          "native_video_mic_mute_applied", activeCallId, "muted=" + muted + " result=" + result);
      return result == 0;
    }
  }

  public static void switchCameraFacing() {
    synchronized (LOCK) {
      if (engine == null || activeCallId == null) return;
      int result = engine.switchCamera();
      NativeVideoCallLog.info("camera_facing_switch", activeCallId, "result=" + result);
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
      reattachInFlightCallId = null;
      localReattachInFlightCallId = null;
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
      reattachInFlightCallId = null;
      localReattachInFlightCallId = null;
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
      rtc.setupRemoteVideo(new VideoCanvas(remote, VideoCanvas.RENDER_MODE_HIDDEN, uid));
      NativeVideoCallActivity.attachRemoteView(sid, remote);
      NativeVideoCallAcceptTiming.markSurfaceAttached(sid);
    } catch (RuntimeException error) {
      REMOTE_SETUP_UIDS.remove(uid);
      fail(sid, "setup_remote_video=" + error.getClass().getSimpleName());
    }
  }

  private static void markRemoteVideoRendered(int uid, String sid, int width, int height, String details) {
    Listener currentListener;
    boolean firstFrame;
    boolean callerJoin;
    synchronized (LOCK) {
      if (!sid.equals(activeCallId)) return;
      firstFrame = !remoteVideoRendered;
      if (remoteVideoRendered) return;
      remoteVideoRendered = true;
      currentListener = listener;
      callerJoin = callerJoinActive;
    }
    if (firstFrame) {
      NativeVideoCallLog.info(
          "native_video_remote_first_frame",
          sid,
          "remoteUid="
              + uid
              + " elapsedFromAnswerMs="
              + NativeVideoCallAcceptTiming.elapsedFromAcceptMs(sid)
              + " elapsedFromJoinMs="
              + NativeVideoCallAcceptTiming.elapsedFromJoinMs(sid)
              + " elapsedFromSurfaceAttachMs="
              + NativeVideoCallAcceptTiming.elapsedFromSurfaceAttachMs(sid)
              + details);
    }
    NativeVideoCallLog.info("remote_video_render_ready", sid, "uid=" + uid + details);
    if (callerJoin) {
      NativeVideoCallActivity.onOutgoingRemoteFirstFrameReady(sid, uid, width, height);
    }
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
            if (!callerJoin) {
              NativeVideoCallAcceptTiming.markJoinSuccess(sid);
            }
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
          if (callerJoin) {
            NativeVideoCallActivity.onOutgoingRemoteUserJoined(sid, uid);
          }
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
          markRemoteVideoRendered(uid, sid, width, height, " width=" + width + " height=" + height);
        }

        @Override
        public void onFirstRemoteVideoFrame(int uid, int width, int height, int elapsed) {
          String sid;
          synchronized (LOCK) {
            sid = activeCallId;
          }
          if (sid == null || uid == 0) return;
          markRemoteVideoRendered(uid, sid, width, height, " width=" + width + " height=" + height);
        }

        @Override
        public void onFirstLocalVideoFrame(
            Constants.VideoSourceType source, int width, int height, int elapsed) {
          String sid;
          boolean callerJoin;
          synchronized (LOCK) {
            sid = activeCallId;
            callerJoin = callerJoinActive;
          }
          if (sid == null || !callerJoin) return;
          NativeVideoCallActivity.onOutgoingLocalFirstFrameReady(sid, width, height);
        }

        @Override
        public void onNetworkQuality(int uid, int txQuality, int rxQuality) {
          if (uid != 0) return;
          NetworkQualityObserver observer;
          String sid;
          synchronized (LOCK) {
            observer = networkQualityObserver;
            sid = activeCallId;
          }
          if (observer == null || sid == null) return;
          int worst = Math.max(txQuality, rxQuality);
          MAIN.post(() -> observer.onNetworkQuality(worst, txQuality, rxQuality));
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
