package com.dibay.app.call;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import com.dibay.app.MainActivity;
import com.dibay.app.nativevideo.NativeVideoCallOwner;
import com.dibay.app.nativevoice.NativeVoiceCallOwner;

/**
 * 통화 화면 → 앱(메신저) 복귀 · 네이티브 소유 통화 판정. UI 전용 — Runtime·Agora·FGS 미접촉.
 * 설계: docs/audit/call-inapp-multitask-legacy-design-2026-10-30.md §5·§11·§12·§17 (저장소에 없음)
 * 복귀 시점·확인: docs/audit/call-back-app-return-bal-design-2026-11-12.md
 */
public final class NativeCallAppReturn {
  private static final String TAG = "DIBAY_CALL";

  /**
   * 복귀 확인 창. 요청 뒤 이 시간 안에 MainActivity 가 재개되면 「실제로 앞으로 옴」으로 기록한다.
   * 설계: docs/audit/call-back-app-return-bal-design-2026-11-12.md §5 — 요청이 시스템에 막혀도
   * {@code AppTask.moveToFront()} 는 예외 없이 돌아오므로, 요청 로그만으로는 성공을 알 수 없다.
   */
  static final long CONFIRM_WINDOW_MS = 1_500L;

  static final String RESULT_CONFIRMED = "confirmed";
  static final String RESULT_LATE = "late";

  private static final Object LOCK = new Object();
  /** 메인 Looper 핸들러 — 필요할 때 만든다(클래스 로딩 때 만들면 JVM 단위 테스트에서 실패). */
  private static Handler main;
  private static String pendingCallId;
  private static String pendingSource;
  private static long pendingAtMs;
  private static String confirmedCallId;
  private static long confirmedAtMs;

  private NativeCallAppReturn() {}

  /** 순수 판정 — 요청 시각 이후 확인 창 안에 재개됐으면 confirmed. */
  static String judge(long requestedAtMs, long resumedAtMs, long windowMs) {
    if (requestedAtMs <= 0L || resumedAtMs < requestedAtMs) return RESULT_LATE;
    return resumedAtMs - requestedAtMs <= windowMs ? RESULT_CONFIRMED : RESULT_LATE;
  }

  /** MainActivity.onResume — 직전 복귀 요청이 실제로 메신저를 앞으로 가져왔는지 기록(동작 불변, 로그만). */
  public static void onMainResumed() {
    long now = SystemClock.elapsedRealtime();
    synchronized (LOCK) {
      if (pendingCallId == null) return;
      String result = judge(pendingAtMs, now, CONFIRM_WINDOW_MS);
      if (RESULT_CONFIRMED.equals(result)) {
        confirmedCallId = pendingCallId;
        confirmedAtMs = now;
        Log.i(
            TAG,
            "[DIBAY_CALL] native_call_app_return_confirmed callId="
                + pendingCallId
                + " source="
                + pendingSource
                + " afterMs="
                + (now - pendingAtMs));
      }
      pendingCallId = null;
      pendingSource = null;
      pendingAtMs = 0L;
    }
  }

  /** {@code sinceMs}(elapsedRealtime) 이후 이 통화의 복귀가 실제로 확인됐는지. */
  public static boolean isConfirmedSince(String callId, long sinceMs) {
    if (callId == null) return false;
    synchronized (LOCK) {
      return callId.equals(confirmedCallId) && confirmedAtMs >= sinceMs;
    }
  }

  private static synchronized Handler mainHandler() {
    if (main == null) main = new Handler(Looper.getMainLooper());
    return main;
  }

  private static void markRequested(String callId, String source) {
    final long at = SystemClock.elapsedRealtime();
    synchronized (LOCK) {
      pendingCallId = callId;
      pendingSource = source;
      pendingAtMs = at;
    }
    mainHandler().postDelayed(
        () -> {
          synchronized (LOCK) {
            if (pendingCallId == null || pendingAtMs != at) return;
            Log.w(
                TAG,
                "[DIBAY_CALL] native_call_app_return_unconfirmed callId="
                    + pendingCallId
                    + " source="
                    + pendingSource
                    + " windowMs="
                    + CONFIRM_WINDOW_MS);
            pendingCallId = null;
            pendingSource = null;
            pendingAtMs = 0L;
          }
        },
        CONFIRM_WINDOW_MS);
  }

  /** Native Runtime(음성·영상)이 소유한 통화인지 — MainActivity 의 통화용 뒤로·홈 처리를 끄는 기준. */
  public static boolean isNativeOwnedCall(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    return NativeVoiceCallOwner.isNativeOwned(callId) || NativeVideoCallOwner.isNativeOwned(callId);
  }

  /**
   * 메신저(MainActivity) task 를 직접 앞으로 가져온다 (통화 Activity 는 종료하지 않음).
   * 실기 2026-10-31 Samsung: 영상 PiP 중 앱 실행(런처) 인텐트는 메신저가 아니라 PiP 영상 task 를 다시 키웠다 →
   * 런처 인텐트를 쓰지 않고, 이 앱의 task 중 base 가 MainActivity 인 task 를 AppTask.moveToFront 로 올린다.
   * 그런 task 가 없을 때만(메신저가 아직 안 떠 있음) MainActivity 를 명시 인텐트로 시작한다.
   * FLAG_ACTIVITY_NO_USER_ACTION: 통화 Activity 에 onUserLeaveHint 를 다시 보내지 않는다(중복 최소화 방지).
   */
  public static boolean bringAppToFront(Activity from, String callId, String source) {
    if (from == null) return false;
    try {
      ActivityManager am = (ActivityManager) from.getSystemService(Context.ACTIVITY_SERVICE);
      if (am != null) {
        String mainClass = MainActivity.class.getName();
        for (ActivityManager.AppTask task : am.getAppTasks()) {
          ActivityManager.RecentTaskInfo info = task != null ? task.getTaskInfo() : null;
          ComponentName base = info != null ? info.baseActivity : null;
          if (base == null && info != null && info.baseIntent != null) base = info.baseIntent.getComponent();
          if (base != null && mainClass.equals(base.getClassName())) {
            markRequested(callId, source);
            task.moveToFront();
            // 요청 기록일 뿐 — 실제 결과는 native_call_app_return_confirmed / _unconfirmed.
            Log.i(TAG, "[DIBAY_CALL] native_call_app_return callId=" + callId + " source=" + source + " via=move_to_front");
            return true;
          }
        }
      }
      Intent launch = new Intent(from, MainActivity.class);
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
      markRequested(callId, source);
      from.startActivity(launch);
      Log.i(TAG, "[DIBAY_CALL] native_call_app_return callId=" + callId + " source=" + source + " via=start_main");
      return true;
    } catch (RuntimeException error) {
      Log.w(
          TAG,
          "[DIBAY_CALL] native_call_app_return_failed callId="
              + callId
              + " err="
              + error.getClass().getSimpleName());
      return false;
    }
  }
}
