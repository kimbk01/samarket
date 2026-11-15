package com.dibay.app.nativecall;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 대기 통화 알림 버튼(거절 / 종료 후 받기) — {@link NativeCallWaitingPresenter}. */
public final class NativeCallWaitingActionReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(NativeCallWaitingPresenter.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String action = intent.getAction();
    if (NativeCallWaitingPresenter.ACTION_REJECT.equals(action)) {
      NativeCallWaitingPresenter.reject(context, callId);
    } else if (NativeCallWaitingPresenter.ACTION_END_AND_ACCEPT.equals(action)) {
      NativeCallWaitingPresenter.endAndAccept(context, callId);
    }
  }
}
