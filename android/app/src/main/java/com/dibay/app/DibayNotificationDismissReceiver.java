package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * 일반 알림을 회원이 밀어서 지웠을 때(deleteIntent) — 앱 아이콘 숫자를 다시 계산한다.
 * 숫자 표시 런처는 알림창 알림 수를 더하므로, 지운 알림 몫만큼 요약 카드 숫자를 되돌려야 한다.
 * 서버 호출·읽음 처리 없음(지운 것은 읽은 것이 아님). docs/audit/app-icon-badge-plus1-proof-and-design-2026-11-04.md
 */
public class DibayNotificationDismissReceiver extends BroadcastReceiver {
  static final String ACTION = "com.dibay.app.NOTIFICATION_DISMISSED";
  static final String EXTRA_NOTIFICATION_ID = "dibay_dismissed_notification_id";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null || !ACTION.equals(intent.getAction())) return;
    int id = intent.getIntExtra(EXTRA_NOTIFICATION_ID, Integer.MIN_VALUE);
    Log.i("DIBAY_APPICON_DELIVERY", "domain_dismissed id=" + id);
    // 지워진 알림이 아직 목록에 남아 있을 수 있어 그 id 를 빼고 계산한다.
    DibayAppIconDeliveryAdapter.reapplyLast(context, id);
  }
}
