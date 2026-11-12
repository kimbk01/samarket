package com.dibay.app.nativevoice;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification · PiP actions for Native Voice Runtime only. */
public class NativeVoiceCallActionReceiver extends BroadcastReceiver {
  public static final String ACTION_ACCEPT = "com.dibay.app.nativevoice.ACCEPT";
  public static final String ACTION_REJECT = "com.dibay.app.nativevoice.REJECT";
  public static final String ACTION_END = "com.dibay.app.nativevoice.END";
  /** SSOT §3 — PiP 마이크 버튼 (기존 통화 화면 마이크 토글과 같은 함수). */
  public static final String ACTION_PIP_MIC = "com.dibay.app.nativevoice.PIP_MIC";
  /** 종료 출처 기록용 (`screen`·`pip`·`notification`). 종료 원인은 모두 USER_END 하나. */
  public static final String EXTRA_SOURCE = "dibay_call_action_source";
  public static final String SOURCE_PIP = "pip";
  public static final String SOURCE_NOTIFICATION = "notification";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(NativeVoiceCallActivity.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      NativeVoiceCallLog.info("notification_accept_tapped", sid);
      NativeVoiceCallRuntime.accept(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_REJECT.equals(action)) {
      NativeVoiceCallLog.info("notification_reject_tapped", sid);
      NativeVoiceCallRuntime.reject(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_END.equals(action)) {
      String source = intent.getStringExtra(EXTRA_SOURCE);
      if (source == null || source.trim().isEmpty()) source = SOURCE_NOTIFICATION;
      NativeVoiceCallLog.info("end_tapped", sid, "source=" + source);
      NativeVoiceCallRuntime.end(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_PIP_MIC.equals(action)) {
      NativeVoiceCallActivity.onPipAction(context.getApplicationContext(), sid, ACTION_PIP_MIC);
      return;
    }
  }
}
