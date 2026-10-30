package com.dibay.app.call;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;
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
   * 앱 아이콘을 누른 것과 같은 실행 인텐트로 DIBAY 를 앞으로 가져온다 (통화 Activity 는 종료하지 않음).
   * FLAG_ACTIVITY_NO_USER_ACTION: 통화 Activity 에 onUserLeaveHint 를 다시 보내지 않는다(중복 최소화 방지).
   */
  public static boolean bringAppToFront(Activity from, String callId, String source) {
    if (from == null) return false;
    try {
      Intent launch = from.getPackageManager().getLaunchIntentForPackage(from.getPackageName());
      if (launch == null) {
        Log.w(TAG, "[DIBAY_CALL] native_call_app_return_failed callId=" + callId + " reason=no_launch_intent");
        return false;
      }
      launch.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
              | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
              | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
      from.startActivity(launch);
      Log.i(TAG, "[DIBAY_CALL] native_call_app_return callId=" + callId + " source=" + source);
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
