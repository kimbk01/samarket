package com.dibay.app.nativecall;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.concurrent.CopyOnWriteArraySet;
import com.dibay.app.DibayNativeLocale;
import com.dibay.app.IncomingCallUiCopy;
import com.dibay.app.R;
import com.dibay.app.nativevideo.NativeVideoCallApi;
import com.dibay.app.nativevideo.NativeVideoCallNotification;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevideo.NativeVideoCallService;
import com.dibay.app.nativevoice.NativeVoiceCallApi;
import com.dibay.app.nativevoice.NativeVoiceCallNotification;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallService;

/**
 * 대기 통화 (WhatsApp 형태 「거절 / 종료 후 받기」, 보류 없음) — docs/audit/call-waiting-stage2-design-2026-11-15.md
 * WA1~WA5.
 *
 * <p>서버가 {@code waiting=true} 로 보낸 수신이 왔고 이 기기의 다른 통화가 <b>연결됨</b>일 때만 동작한다. 그 밖은 호출부의
 * 기존 busy 처리(busy_suppressed)가 그대로 돈다. 대기 통화는 런타임 SESSIONS 에 넣지 않는다(넣으면 엔진 점유·통화 화면
 * 앞으로·발신 거부 판정이 이 통화를 진행 중으로 본다). 정보는 여기서만 보관한다(동시에 1건).
 *
 * <ul>
 *   <li>거절: 새 통화만 reject API. 진행 중 통화 유지.
 *   <li>종료 후 받기: 진행 중 통화를 평소 종료 경로(runtime.end)로 끝냄 → 그 통화 정리 완료 신호
 *       ({@link #onCallCleanedUp}) → 새 통화를 일반 수신으로 등록 후 바로 accept. 엔진이 1개라 순서 고정.
 *   <li>진행 중 통화가 먼저 끝남(WA4): 대기 통화를 일반 수신 화면으로 전환.
 *   <li>대기 통화의 종료 신호(취소·무응답·다른 기기 응답, WA5) 또는 30초 경과: 대기 알림만 닫음.
 * </ul>
 *
 * <p>선택지 유지 (실기 CW1 FAIL 수정 · Owner 「구현 승인」 2026-11-15): 대기 알림은 진행 중 통화 화면을 전체 화면 인텐트로
 * 가진다 — 기기 사용 중에는 SystemUI 가 FSI 알림의 heads-up 을 자동으로 내리지 않아 거절·종료 후 받기를 고를 때까지 남고,
 * 화면이 꺼져 있으면 통화 화면을 켠다. 통화 화면 안에는 {@link NativeCallWaitingBanner} 가 같은 선택지를 계속 보인다.
 *
 * <p>표면 1개 (실기 「알림 2개」 FAIL 수정 · Owner 「구현 승인」 2026-11-15): AOSP Dialer
 * {@code StatusBarNotifier} 와 같이 통화 화면이 보이면 대기 알림은 조용한 알림(진행 중 통화 채널·FSI 없음·heads-up 없음,
 * 선택지는 통화 화면 띠 하나), 안 보이면 FSI 알림. 보임 상태는 {@link #setCallScreenVisible} 로 받고, 대기 중 바뀌면 다시
 * 올린다(조용→시끄러움은 cancel 후 notify — setOnlyAlertOnce 때문에 갱신만으로는 heads-up 이 안 뜸).
 * 기록: docs/audit/call-waiting-device-verify-2026-11-15/README.md
 */
public final class NativeCallWaitingPresenter {
  private static final String TAG = "DIBAY_CALL_WAITING";
  public static final String ACTION_REJECT = "com.dibay.app.nativecall.CALL_WAITING_REJECT";
  public static final String ACTION_END_AND_ACCEPT = "com.dibay.app.nativecall.CALL_WAITING_END_AND_ACCEPT";
  public static final String EXTRA_CALL_ID = "dibay_call_waiting_call_id";

  private static final long RING_TIMEOUT_MS = 30_000L;
  private static final long BEEP_INTERVAL_MS = 3_000L;
  private static final int BEEP_DURATION_MS = 300;
  private static final long END_AND_ACCEPT_TIMEOUT_MS = 8_000L;
  private static final long AFTER_CLEANUP_DELAY_MS = 150L;
  private static final int NOTIFICATION_ID_BASE = 97001;

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  private static final class Pending {
    final String callId;
    final String roomId;
    final String callerId;
    final String callerName;
    final String lane; // "voice" | "video"
    final String mediaType;
    final String liveCallId;
    boolean acceptRequested;

    Pending(
        String callId,
        String roomId,
        String callerId,
        String callerName,
        String lane,
        String mediaType,
        String liveCallId) {
      this.callId = callId;
      this.roomId = roomId;
      this.callerId = callerId;
      this.callerName = callerName;
      this.lane = lane;
      this.mediaType = mediaType;
      this.liveCallId = liveCallId;
    }
  }

  /** 통화 화면 대기 띠가 구독한다. 메인 스레드에서 호출된다. */
  public interface Listener {
    void onCallWaitingChanged();
  }

  /** 대기 띠에 그릴 정보. 종료 후 받기 진행 중이면 보이지 않는다(null). */
  public static final class Snapshot {
    public final String callId;
    public final String callerName;
    public final String lane;

    Snapshot(String callId, String callerName, String lane) {
      this.callId = callId;
      this.callerName = callerName;
      this.lane = lane;
    }
  }

  private static final CopyOnWriteArraySet<Listener> LISTENERS = new CopyOnWriteArraySet<>();

  private static Pending pending;
  /** 진행 중 통화 화면(음성·영상 Activity)이 앞에 보이는지 — PiP 는 안 보임. 메인 스레드에서만 바뀐다. */
  private static boolean callScreenVisible;
  /** 지금 올라가 있는 대기 알림이 조용한 알림인지(보임 상태가 바뀔 때만 다시 올리기 위함). */
  private static Boolean postedQuiet;
  private static ToneGenerator toneGenerator;
  private static Runnable timeoutRunnable;
  private static Runnable beepRunnable;
  private static Runnable acceptTimeoutRunnable;

  private NativeCallWaitingPresenter() {}

  /**
   * @return true 면 대기 알림을 띄움(수신 표시 완료). false 면 호출부가 기존 busy 처리를 계속한다.
   */
  public static boolean tryPresent(
      Context context,
      String callId,
      String roomId,
      String callerId,
      String callerName,
      String lane,
      String mediaType,
      String liveCallId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String live = liveCallId != null ? liveCallId.trim() : "";
    if (live.isEmpty() || live.equals(sid)) return false;
    if (!isConnected(live)) {
      log("present_skipped", sid, "reason=live_not_connected live=" + live);
      return false;
    }
    synchronized (LOCK) {
      if (pending != null && !pending.callId.equals(sid)) {
        log("present_skipped", sid, "reason=already_waiting other=" + pending.callId);
        return false;
      }
      if (pending != null) return true; // 같은 통화의 중복 푸시
      pending = new Pending(sid, roomId, callerId, callerName, lane, mediaType, live);
    }
    showNotification(app, sid, callerName, lane, live);
    startBeep();
    scheduleTimeout(app, sid);
    notifyChanged();
    log("present", sid, "lane=" + lane + " live=" + live);
    return true;
  }

  /**
   * 통화 화면 보임 상태 — {@link NativeCallWaitingBanner} 가 Activity onResume/onPause/PiP 변화 때 부른다. 대기 중이고 상태가
   * 바뀌었으면 대기 알림을 그 상태에 맞게 다시 올린다.
   */
  public static void setCallScreenVisible(Context context, boolean visible) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    final Pending p;
    synchronized (LOCK) {
      if (callScreenVisible == visible) return;
      callScreenVisible = visible;
      p = pending != null && !pending.acceptRequested ? pending : null;
    }
    log("call_screen_visible", p != null ? p.callId : null, "visible=" + visible);
    if (p != null) showNotification(app, p.callId, p.callerName, p.lane, p.liveCallId);
  }

  public static void addListener(Listener listener) {
    if (listener != null) LISTENERS.add(listener);
  }

  public static void removeListener(Listener listener) {
    if (listener != null) LISTENERS.remove(listener);
  }

  public static Snapshot current() {
    synchronized (LOCK) {
      if (pending == null || pending.acceptRequested) return null;
      return new Snapshot(pending.callId, pending.callerName, pending.lane);
    }
  }

  private static void notifyChanged() {
    MAIN.post(
        () -> {
          for (Listener listener : LISTENERS) {
            try {
              listener.onCallWaitingChanged();
            } catch (RuntimeException error) {
              log("listener_error", null, "error=" + error.getClass().getSimpleName());
            }
          }
        });
  }

  public static boolean isWaiting(String callId) {
    if (callId == null) return false;
    synchronized (LOCK) {
      return pending != null && pending.callId.equals(callId.trim());
    }
  }

  /** 알림 「거절」 — 새 통화만 거절. 진행 중 통화 유지. */
  static void reject(Context context, String callId) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    Pending p = take(callId);
    if (p == null) return;
    clearPresentation(app, p.callId);
    log("reject", p.callId, "lane=" + p.lane);
    if ("video".equals(p.lane)) {
      NativeVideoCallApi.rejectAsync(
          app, p.callId, (ok, status, error) -> log("reject_done", p.callId, "ok=" + ok + " status=" + status));
    } else {
      NativeVoiceCallApi.rejectAsync(
          app, p.callId, (ok, status, error) -> log("reject_done", p.callId, "ok=" + ok + " status=" + status));
    }
  }

  /** 알림 「종료 후 받기」 — 진행 중 통화 종료 후 새 통화 수락. */
  static void endAndAccept(Context context, String callId) {
    if (context == null || callId == null) return;
    Context app = context.getApplicationContext();
    Pending p;
    synchronized (LOCK) {
      if (pending == null || !pending.callId.equals(callId.trim())) return;
      pending.acceptRequested = true;
      p = pending;
    }
    stopBeep();
    cancelTimeout();
    dismissNotification(app, p.callId);
    notifyChanged();
    String live = currentLiveCallId(p.callId);
    log("end_and_accept", p.callId, "live=" + (live != null ? live : "none"));
    if (live == null) {
      MAIN.post(() -> promote(app, p.callId, true));
      return;
    }
    scheduleAcceptTimeout(app, p.callId);
    if (NativeVoiceCallRuntime.getSession(live) != null) {
      NativeVoiceCallRuntime.end(app, live, "call_waiting_end_and_accept");
    } else {
      NativeVideoCallRuntime.end(app, live, "call_waiting_end_and_accept");
    }
  }

  /** 두 런타임의 cleanup 끝에서 호출 — 진행 중 통화가 모두 정리되면 대기 통화를 이어서 처리한다. */
  public static void onCallCleanedUp(Context context, String cleanedCallId) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    final String waitingId;
    synchronized (LOCK) {
      if (pending == null) return;
      if (cleanedCallId != null && pending.callId.equals(cleanedCallId.trim())) return;
      waitingId = pending.callId;
    }
    MAIN.postDelayed(
        () -> {
          if (currentLiveCallId(waitingId) != null) return; // 아직 다른 통화가 남음
          boolean accept;
          synchronized (LOCK) {
            if (pending == null || !pending.callId.equals(waitingId)) return;
            accept = pending.acceptRequested;
          }
          promote(app, waitingId, accept);
        },
        AFTER_CLEANUP_DELAY_MS);
  }

  /** 대기 통화의 종료 신호(취소·무응답·다른 기기 응답·거절) — 대기 알림만 닫는다. */
  public static void onTerminal(Context context, String callId, String kind) {
    if (context == null) return;
    Pending p = take(callId);
    if (p == null) return;
    clearPresentation(context.getApplicationContext(), p.callId);
    log("terminal", p.callId, "kind=" + kind);
  }

  // ── internal ──────────────────────────────────────────────────────────────

  /** 대기 통화를 일반 수신으로 등록(대기 해제). accept=true 면 바로 수락(종료 후 받기). */
  private static void promote(Context app, String callId, boolean accept) {
    Pending p = take(callId);
    if (p == null) return;
    clearPresentation(app, p.callId);
    boolean presented;
    if ("video".equals(p.lane)) {
      presented =
          NativeVideoCallRuntime.handleIncoming(
              app, p.callId, p.roomId, p.callerId, p.callerName, p.mediaType, false);
      if (presented && accept) NativeVideoCallRuntime.accept(app, p.callId);
    } else {
      presented =
          NativeVoiceCallRuntime.handleIncoming(
              app, p.callId, p.roomId, p.callerId, p.callerName, p.mediaType, false);
      if (presented && accept) NativeVoiceCallRuntime.accept(app, p.callId);
    }
    log("promote", p.callId, "accept=" + accept + " presented=" + presented);
  }

  private static Pending take(String callId) {
    if (callId == null) return null;
    synchronized (LOCK) {
      if (pending == null || !pending.callId.equals(callId.trim())) return null;
      Pending p = pending;
      pending = null;
      notifyChanged();
      return p;
    }
  }

  private static boolean isConnected(String callId) {
    return CallTerminationPolicy.Phase.CONNECTED == NativeVoiceCallRuntime.phaseOfCall(callId)
        || CallTerminationPolicy.Phase.CONNECTED == NativeVideoCallRuntime.phaseOfCall(callId);
  }

  private static String currentLiveCallId(String excludingCallId) {
    String voice = NativeVoiceCallRuntime.findOtherLiveSessionCallId(excludingCallId);
    if (voice != null) return voice;
    return NativeVideoCallRuntime.findOtherLiveSessionCallId(excludingCallId);
  }

  private static void clearPresentation(Context app, String callId) {
    stopBeep();
    cancelTimeout();
    cancelAcceptTimeout();
    dismissNotification(app, callId);
  }

  private static void scheduleTimeout(Context app, String callId) {
    cancelTimeout();
    timeoutRunnable =
        () -> {
          Pending p = take(callId);
          if (p == null) return;
          clearPresentation(app, p.callId);
          // 서버가 울림 만료로 missed 를 확정한다(부재중 알림은 서버 경로). 여기서는 표시만 닫는다.
          log("timeout", p.callId, "afterMs=" + RING_TIMEOUT_MS);
        };
    MAIN.postDelayed(timeoutRunnable, RING_TIMEOUT_MS);
  }

  private static void cancelTimeout() {
    if (timeoutRunnable != null) {
      MAIN.removeCallbacks(timeoutRunnable);
      timeoutRunnable = null;
    }
  }

  /** 종료 후 받기에서 진행 중 통화 정리가 오지 않으면 알림을 다시 띄워 사용자가 다시 고를 수 있게 한다. */
  private static void scheduleAcceptTimeout(Context app, String callId) {
    cancelAcceptTimeout();
    acceptTimeoutRunnable =
        () -> {
          Pending p;
          synchronized (LOCK) {
            if (pending == null || !pending.callId.equals(callId)) return;
            if (currentLiveCallId(callId) == null) {
              p = null;
            } else {
              pending.acceptRequested = false;
              p = pending;
            }
          }
          if (p == null) {
            promote(app, callId, true);
            return;
          }
          log("end_and_accept_timeout", callId, "live_still_present");
          showNotification(app, p.callId, p.callerName, p.lane, p.liveCallId);
          startBeep();
          scheduleTimeout(app, p.callId);
          notifyChanged();
        };
    MAIN.postDelayed(acceptTimeoutRunnable, END_AND_ACCEPT_TIMEOUT_MS);
  }

  private static void cancelAcceptTimeout() {
    if (acceptTimeoutRunnable != null) {
      MAIN.removeCallbacks(acceptTimeoutRunnable);
      acceptTimeoutRunnable = null;
    }
  }

  private static void startBeep() {
    MAIN.post(
        () -> {
          stopBeepOnMain();
          try {
            toneGenerator = new ToneGenerator(AudioManager.STREAM_VOICE_CALL, 60);
          } catch (RuntimeException error) {
            toneGenerator = null;
            log("beep_unavailable", null, "error=" + error.getClass().getSimpleName());
            return;
          }
          beepRunnable =
              new Runnable() {
                @Override
                public void run() {
                  ToneGenerator tg = toneGenerator;
                  if (tg == null) return;
                  try {
                    tg.startTone(ToneGenerator.TONE_SUP_CALL_WAITING, BEEP_DURATION_MS);
                  } catch (RuntimeException ignored) {
                    // best-effort
                  }
                  MAIN.postDelayed(this, BEEP_INTERVAL_MS);
                }
              };
          MAIN.post(beepRunnable);
        });
  }

  private static void stopBeep() {
    MAIN.post(NativeCallWaitingPresenter::stopBeepOnMain);
  }

  private static void stopBeepOnMain() {
    if (beepRunnable != null) {
      MAIN.removeCallbacks(beepRunnable);
      beepRunnable = null;
    }
    if (toneGenerator != null) {
      try {
        toneGenerator.stopTone();
        toneGenerator.release();
      } catch (RuntimeException ignored) {
        // best-effort
      }
      toneGenerator = null;
    }
  }

  private static int notificationId(String callId) {
    return NOTIFICATION_ID_BASE + Math.abs(callId.hashCode() % 1000);
  }

  private static void showNotification(
      Context app, String callId, String callerName, String lane, String liveCallId) {
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm == null) return;
    final boolean quiet;
    synchronized (LOCK) {
      quiet = callScreenVisible;
    }
    String name = IncomingCallUiCopy.callerDisplayName(callerName, null, null);
    String text =
        DibayNativeLocale.string(
            app,
            "video".equals(lane)
                ? R.string.dibay_call_waiting_text_video
                : R.string.dibay_call_waiting_text_voice);
    PendingIntent ongoingCallScreen = ongoingCallScreenIntent(app, liveCallId);
    String channelId;
    if (quiet) {
      // Dialer NOTIFICATION_INCOMING_CALL_QUIET: 진행 중 통화 채널(IMPORTANCE_DEFAULT) — heads-up 없음.
      // 그 통화의 진행 중 알림이 이미 쓰는 채널이라 존재가 보장된다.
      channelId =
          liveCallId != null && NativeVoiceCallRuntime.getSession(liveCallId) != null
              ? NativeVoiceCallService.CHANNEL_ID
              : NativeVideoCallService.CHANNEL_ID;
    } else {
      NativeVoiceCallNotification.ensureIncomingChannel(app);
      channelId = NativeVoiceCallNotification.CHANNEL_ID;
    }
    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(name)
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(quiet ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(quiet)
            .setColor(ContextCompat.getColor(app, R.color.dibay_incoming_primary))
            .addAction(
                new NotificationCompat.Action.Builder(
                        0, IncomingCallUiCopy.rejectLabel(app), actionIntent(app, callId, ACTION_REJECT))
                    .build())
            .addAction(
                new NotificationCompat.Action.Builder(
                        0,
                        DibayNativeLocale.string(app, R.string.dibay_call_waiting_end_and_accept),
                        actionIntent(app, callId, ACTION_END_AND_ACCEPT))
                    .build());
    if (ongoingCallScreen != null) {
      builder.setContentIntent(ongoingCallScreen);
      // Dialer NOTIFICATION_INCOMING_CALL: FSI 가 있는 알림만 SystemUI 가 heads-up 을 자동으로 내리지 않는다.
      if (!quiet) builder.setFullScreenIntent(ongoingCallScreen, true);
    } else if (!quiet) {
      log("fsi_unavailable", callId, "live=" + liveCallId);
    }
    Notification notification = builder.build();
    int id = notificationId(callId);
    try {
      // 조용↔시끄러움 전환: 같은 id 갱신은 setOnlyAlertOnce 로 heads-up 이 다시 안 뜨고(조용→시끄러움),
      // 이미 떠 있는 heads-up 이 남을 수 있어(시끄러움→조용) 지우고 새로 올린다.
      if (postedQuiet != null && postedQuiet != quiet) nm.cancel(id);
      nm.notify(id, notification);
      postedQuiet = quiet;
      log("notice_posted", callId, "quiet=" + quiet);
    } catch (SecurityException error) {
      log("notify_denied", callId, "error=" + error.getClass().getSimpleName());
    }
  }


  /** 진행 중 통화(음성·영상)의 통화 화면 — 그 통화 알림의 contentIntent 와 같은 것. */
  private static PendingIntent ongoingCallScreenIntent(Context app, String liveCallId) {
    if (liveCallId == null || liveCallId.trim().isEmpty()) return null;
    String live = liveCallId.trim();
    if (NativeVoiceCallRuntime.getSession(live) != null) {
      return NativeVoiceCallNotification.ongoingCallActivityIntent(app, live);
    }
    return NativeVideoCallNotification.ongoingCallActivityIntent(app, live);
  }

  private static void dismissNotification(Context app, String callId) {
    postedQuiet = null;
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm != null) nm.cancel(notificationId(callId));
  }

  private static PendingIntent actionIntent(Context app, String callId, String action) {
    Intent intent = new Intent(app, NativeCallWaitingActionReceiver.class);
    intent.setAction(action);
    intent.putExtra(EXTRA_CALL_ID, callId);
    return PendingIntent.getBroadcast(
        app,
        notificationId(callId) * 31 + action.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void log(String event, String callId, String detail) {
    Log.i(TAG, "[DIBAY_CALL_WAITING] " + event + " callId=" + (callId != null ? callId : "-") + " " + detail);
  }
}
