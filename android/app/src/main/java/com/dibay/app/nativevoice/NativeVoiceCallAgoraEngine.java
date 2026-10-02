package com.dibay.app.nativevoice;

import android.content.Context;
import com.dibay.app.nativecall.NativeAgoraEngineLifecycle;
import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;
import java.util.concurrent.CountDownLatch;

/** Agora Android SDK wrapper for voice-only Native Runtime. */
public final class NativeVoiceCallAgoraEngine {
  public interface Listener {
    void onConnected();

    void onDisconnected(String reason);

    void onError(String reason);

    /** Remote peer left the channel (USER_OFFLINE_QUIT). Not network drop. */
    void onRemotePeerLeft(String reason);
  }

  private static final Object LOCK = new Object();
  private static final String LANE = "voice";
  private static RtcEngine engine;
  /** {@link NativeAgoraEngineLifecycle} epoch in which {@link #engine} was created. */
  private static long engineEpoch = -1L;
  private static String activeCallId;
  private static Listener listener;
  private static boolean callerJoinActive;
  private static int remoteUid;
  /**
   * leaveChannel in flight — join awaits this (usually ms). Cleanup must never await.
   *
   * <p>Normal leave does NOT call {@link RtcEngine#destroy()}: destroy is process-global and can
   * stall ~seconds on OEM devices, which previously blocked end UX and re-dial. Engine is reused
   * across calls; destroy only via {@link #releaseZombieEngine(String)}.
   */
  private static volatile CountDownLatch pendingChannelLeave;

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
    synchronized (LOCK) {
      listener = nextListener;
      activeCallId = sid;
      callerJoinActive = caller;
      remoteUid = 0;
    }
    if (caller) {
      NativeVoiceCallLog.info("caller_agora_native_join_start", sid, "channel=" + token.channelName);
    } else {
      NativeVoiceCallLog.info("agora_native_join_start", sid, "channel=" + token.channelName);
    }
    new Thread(
            () -> {
              try {
                NativeVoiceCallAgoraEngine.awaitPendingChannelLeave(sid);
                RtcEngine rtc = ensureEngine(context.getApplicationContext(), token.appId, sid);
                if (rtc == null) return;
                rtc.enableAudio();
                // WP-3 NEW-28: engine is reused across calls — every call starts unmuted.
                int unmute = rtc.muteLocalAudioStream(false);
                NativeVoiceCallLog.info("native_voice_mic_mute_reset", sid, "result=" + unmute);
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
                if (com.dibay.app.nativecall.NativeCallDebugHooks.shouldForceJoinFailure(context)) {
                  fail(sid, "forced_test_join_failure");
                  return;
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
   * WP-3 NEW-28: real microphone mute for the current occupant call.
   *
   * @return true only when Agora accepted the change (result 0); callers update UI state only then.
   */
  public static boolean setMicMuted(String callId, boolean muted) {
    synchronized (LOCK) {
      if (engine == null
          || activeCallId == null
          || callId == null
          || !activeCallId.equals(callId.trim())) {
        NativeVoiceCallLog.warn(
            "native_voice_mic_mute_rejected",
            callId != null ? callId : "unknown",
            "muted=" + muted + " reason=not_occupant occupant=" + activeCallId);
        return false;
      }
      int result = engine.muteLocalAudioStream(muted);
      NativeVoiceCallLog.info(
          "native_voice_mic_mute_applied", activeCallId, "muted=" + muted + " result=" + result);
      return result == 0;
    }
  }

  /** Guard-only: current Agora occupant callId, or null when unset. */
  public static String peekOccupantCallId() {
    synchronized (LOCK) {
      return activeCallId != null && !activeCallId.isEmpty() ? activeCallId : null;
    }
  }

  /**
   * Detach occupancy immediately, then schedule leaveChannel without blocking cleanup/UI.
   *
   * <p>Does not destroy the process-global RtcEngine (destroy stalls end/re-dial). Join awaits
   * {@link #awaitPendingChannelLeave(String)} then reuses the engine.
   *
   * <p>When {@code callId} is non-null and does not match the current occupant, skip leave so a
   * failed new dial cannot tear down a foreign live session's channel while that session map entry
   * still blocks {@code native_engine_busy}.
   */
  public static void leave(String callId, String reason) {
    Listener currentListener;
    String sid;
    RtcEngine engineToLeave;
    CountDownLatch latch;
    synchronized (LOCK) {
      String occupant = activeCallId;
      if (callId != null
          && !callId.trim().isEmpty()
          && occupant != null
          && !occupant.isEmpty()
          && !callId.trim().equals(occupant)) {
        NativeVoiceCallLog.info(
            "agora_leave_skip_foreign_occupant",
            callId.trim(),
            "occupant=" + occupant + " reason=" + (reason != null ? reason : ""));
        return;
      }
      currentListener = listener;
      sid = activeCallId;
      listener = null;
      activeCallId = null;
      callerJoinActive = false;
      remoteUid = 0;
      engineToLeave = engine;
      latch = engineToLeave != null ? new CountDownLatch(1) : null;
      if (latch != null) {
        pendingChannelLeave = latch;
      }
    }
    if (engineToLeave != null) {
      if (sid != null) {
        NativeVoiceCallLog.info(
            "agora_leave_scheduled",
            sid,
            "thread="
                + Thread.currentThread().getName()
                + " reason="
                + (reason != null ? reason : "")
                + " destroy=false");
      }
      scheduleLeaveChannel(engineToLeave, sid, latch);
    }
    if (sid != null) {
      NativeAgoraEngineLifecycle.releaseOwnership(LANE, sid);
    }
    if (currentListener != null && sid != null) {
      currentListener.onDisconnected(reason != null ? reason : "leave");
    }
  }

  public static void leave(String reason) {
    leave(null, reason);
  }

  /**
   * Reclaim engine with no occupant (zombie). Only path that may call {@link RtcEngine#destroy()}.
   *
   * @return true when a zombie engine was released
   */
  public static boolean releaseZombieEngine(String reason) {
    synchronized (LOCK) {
      if (engine == null) return false;
      if (activeCallId != null && !activeCallId.isEmpty()) return false;
    }
    // WP-3 NEW-29: the release goes through the process-wide lifecycle so it can never overlap a
    // new owner's create/join on either lane (RtcEngine.destroy() is process-global).
    long token = NativeAgoraEngineLifecycle.beginRelease(LANE, reason);
    if (token == NativeAgoraEngineLifecycle.RELEASE_REFUSED_OWNED) {
      return false;
    }
    RtcEngine engineToDestroy;
    CountDownLatch latch = null;
    synchronized (LOCK) {
      if (engine == null || (activeCallId != null && !activeCallId.isEmpty())) {
        if (token > 0) NativeAgoraEngineLifecycle.completeRelease(token, LANE);
        return false;
      }
      listener = null;
      remoteUid = 0;
      engineToDestroy = engine;
      engine = null;
      engineEpoch = -1L;
      if (token > 0) {
        latch = new CountDownLatch(1);
        pendingChannelLeave = latch;
      }
    }
    if (token > 0) {
      scheduleDestroyEngine(engineToDestroy, "zombie", latch, token);
    } else {
      // Another lane is already releasing the shared native engine: only drop our reference.
      NativeVoiceCallLog.info("engine_ref_dropped_release_in_progress", "zombie", "reason=" + reason);
    }
    return true;
  }

  /** Join-only: wait until prior leaveChannel finished so the next joinChannel is safe. */
  static void awaitPendingChannelLeave(String callId) {
    CountDownLatch latch = pendingChannelLeave;
    if (latch == null) return;
    String sid = callId != null ? callId : "unknown";
    NativeVoiceCallLog.info(
        "agora_leave_await_join", sid, "thread=" + Thread.currentThread().getName());
    try {
      latch.await();
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      NativeVoiceCallLog.warn("error_terminal", sid, "agora_leave_await_interrupted");
    }
  }

  private static void scheduleLeaveChannel(RtcEngine engineToLeave, String sid, CountDownLatch latch) {
    new Thread(
            () -> {
              try {
                if (sid != null) {
                  NativeVoiceCallLog.info(
                      "before_agora_leave", sid, "thread=" + Thread.currentThread().getName());
                }
                engineToLeave.leaveChannel();
                if (sid != null) {
                  NativeVoiceCallLog.info(
                      "after_agora_leave", sid, "thread=" + Thread.currentThread().getName());
                }
              } catch (RuntimeException error) {
                if (sid != null) {
                  NativeVoiceCallLog.warn(
                      "error_terminal", sid, "agora_leave=" + error.getClass().getSimpleName());
                }
              } finally {
                if (latch != null) {
                  latch.countDown();
                  synchronized (LOCK) {
                    if (pendingChannelLeave == latch) {
                      pendingChannelLeave = null;
                    }
                  }
                }
              }
            },
            "dibay-voice-agora-leave")
        .start();
  }

  private static void scheduleDestroyEngine(
      RtcEngine engineToDestroy, String sid, CountDownLatch latch, long releaseToken) {
    new Thread(
            () -> {
              try {
                if (sid != null) {
                  NativeVoiceCallLog.info(
                      "before_agora_leave", sid, "thread=" + Thread.currentThread().getName());
                }
                engineToDestroy.leaveChannel();
                if (sid != null) {
                  NativeVoiceCallLog.info(
                      "after_agora_leave", sid, "thread=" + Thread.currentThread().getName());
                  NativeVoiceCallLog.info(
                      "before_agora_destroy", sid, "thread=" + Thread.currentThread().getName());
                }
                if (NativeAgoraEngineLifecycle.mayDestroy(releaseToken)) {
                  RtcEngine.destroy();
                }
                if (sid != null) {
                  NativeVoiceCallLog.info(
                      "after_agora_destroy", sid, "thread=" + Thread.currentThread().getName());
                }
              } catch (RuntimeException error) {
                if (sid != null) {
                  NativeVoiceCallLog.warn(
                      "error_terminal", sid, "agora_leave=" + error.getClass().getSimpleName());
                }
              } finally {
                NativeAgoraEngineLifecycle.completeRelease(releaseToken, LANE);
                if (latch != null) {
                  latch.countDown();
                  synchronized (LOCK) {
                    if (pendingChannelLeave == latch) {
                      pendingChannelLeave = null;
                    }
                  }
                }
              }
            },
            "dibay-voice-agora-destroy")
        .start();
  }

  /**
   * WP-3 NEW-29: waits (join worker thread) until any in-progress engine release on either lane has
   * completed, then takes ownership. Returns null when the call stopped being the occupant while
   * waiting (ownership is handed back).
   */
  private static RtcEngine ensureEngine(Context context, String appId, String sid) throws Exception {
    awaitPendingChannelLeave(sid);
    long epoch = NativeAgoraEngineLifecycle.awaitReleaseAndAcquire(LANE, sid);
    synchronized (LOCK) {
      if (activeCallId == null || !activeCallId.equals(sid)) {
        NativeVoiceCallLog.info(
            "engine_acquire_abandoned", sid, "reason=occupant_changed occupant=" + activeCallId);
        NativeAgoraEngineLifecycle.releaseOwnership(LANE, sid);
        return null;
      }
      if (engine != null && engineEpoch == epoch) return engine;
      if (engine != null) {
        NativeVoiceCallLog.info(
            "engine_stale_epoch_dropped", sid, "engineEpoch=" + engineEpoch + " epoch=" + epoch);
        engine = null;
      }
      RtcEngineConfig config = new RtcEngineConfig();
      config.mContext = context;
      config.mAppId = appId;
      config.mEventHandler = EVENT_HANDLER;
      engine = RtcEngine.create(config);
      engineEpoch = epoch;
      engine.setChannelProfile(Constants.CHANNEL_PROFILE_COMMUNICATION);
      NativeVoiceCallLog.info("engine_created", sid, "epoch=" + epoch);
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
            if (uid != 0) remoteUid = uid;
          }
          if (!callerJoin || sid == null || uid == 0) return;
          NativeVoiceCallLog.info("remote_user_joined", sid, "uid=" + uid);
          if (currentListener != null) currentListener.onConnected();
        }

        @Override
        public void onUserOffline(int uid, int reason) {
          Listener currentListener;
          String sid;
          int expectedUid;
          synchronized (LOCK) {
            currentListener = listener;
            sid = activeCallId;
            expectedUid = remoteUid;
          }
          if (sid == null || uid == 0 || uid != expectedUid) return;
          if (reason == Constants.USER_OFFLINE_QUIT) {
            NativeVoiceCallLog.info("agora_remote_user_offline_quit", sid, "uid=" + uid);
            if (currentListener != null) currentListener.onRemotePeerLeft("agora_user_offline_quit");
            return;
          }
          NativeVoiceCallLog.info(
              "agora_remote_user_offline_ignored", sid, "uid=" + uid + " reason=" + reason);
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
