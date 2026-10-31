package com.dibay.app.call;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.MainActivity;
import com.dibay.app.nativevideo.NativeVideoCallOwner;
import com.dibay.app.nativevoice.NativeVoiceCallOwner;

/**
 * 통화 화면 → 앱(메신저) 복귀 · 네이티브 소유 통화 판정. UI 전용 — Runtime·Agora·FGS 미접촉.
 * 설계: docs/audit/call-inapp-multitask-legacy-design-2026-10-30.md §5·§11·§12·§17
 */
public final class NativeCallAppReturn {
  private static final String TAG = "DIBAY_CALL";

  private NativeCallAppReturn() {}

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
            task.moveToFront();
            Log.i(TAG, "[DIBAY_CALL] native_call_app_return callId=" + callId + " source=" + source + " via=move_to_front");
            return true;
          }
        }
      }
      Intent launch = new Intent(from, MainActivity.class);
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
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
