package com.dibay.app.nativevideo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification · PiP actions for Native Video Runtime only. */
public class NativeVideoCallActionReceiver extends BroadcastReceiver {
  public static final String ACTION_ACCEPT = "com.dibay.app.nativevideo.ACCEPT";
  public static final String ACTION_REJECT = "com.dibay.app.nativevideo.REJECT";
  public static final String ACTION_END = "com.dibay.app.nativevideo.END";
  /** SSOT §3 — PiP 마이크 버튼 (기존 통화 화면 마이크 토글과 같은 함수). */
  public static final String ACTION_PIP_MIC = "com.dibay.app.nativevideo.PIP_MIC";
  /** SSOT §3 — PiP 카메라 버튼 (기존 통화 화면 카메라 토글과 같은 함수). */
  public static final String ACTION_PIP_CAMERA = "com.dibay.app.nativevideo.PIP_CAMERA";
  /** 종료 출처 기록용 (`screen`·`pip`·`notification`). 종료 원인은 모두 USER_END 하나. */
  public static final String EXTRA_SOURCE = "dibay_call_action_source";
  public static final String SOURCE_PIP = "pip";
  public static final String SOURCE_NOTIFICATION = "notification";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(NativeVideoCallActivity.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      NativeVideoCallLog.info("notification_accept_tapped", sid);
      NativeVideoCallRuntime.accept(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_REJECT.equals(action)) {
      NativeVideoCallLog.info("notification_reject_tapped", sid);
      NativeVideoCallRuntime.reject(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_END.equals(action)) {
      String source = intent.getStringExtra(EXTRA_SOURCE);
      if (source == null || source.trim().isEmpty()) source = SOURCE_NOTIFICATION;
      NativeVideoCallLog.info("end_tapped", sid, "source=" + source);
      NativeVideoCallRuntime.end(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_PIP_MIC.equals(action)) {
      NativeVideoCallActivity.onPipAction(context.getApplicationContext(), sid, ACTION_PIP_MIC);
      return;
    }
    if (ACTION_PIP_CAMERA.equals(action)) {
      NativeVideoCallActivity.onPipAction(context.getApplicationContext(), sid, ACTION_PIP_CAMERA);
    }
  }
}
