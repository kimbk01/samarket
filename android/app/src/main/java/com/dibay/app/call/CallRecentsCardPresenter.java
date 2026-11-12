package com.dibay.app.call;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import com.dibay.app.DibayNativeLocale;
import com.dibay.app.R;
import java.util.List;

/**
 * SSOT {@code docs/dibay-call-minimized-surface-cta-ssot.md} §6 — 최근 앱(|||) 통화 카드.
 *
 * <p>통화 화면 작업은 매니페스트에서 {@code excludeFromRecents="true"} 그대로 두고(벨·연결 중·잠금 화면 수신은 지금처럼
 * 숨김), <b>CONNECTED 동안만</b> 이 작업을 최근 앱에 보이게 한다. 그 밖의 상태·화면 종료에서는 다시 숨긴다 — 종료 후
 * 카드 잔류 0. 레거시 근거: Telegram 실측 T6(PiP 를 닫아도 최근 앱에 통화 카드가 남아 다시 열 수 있음).
 *
 * <p>카드를 밀어 없애도 통화는 끝나지 않는다(11-01 판단표 SURFACE_LOST = KEEP, Telegram T8). 이 클래스는 표시만 하고 통화
 * 상태를 바꾸지 않는다.
 */
public final class CallRecentsCardPresenter {
  private static final String TAG = "DIBAY_CALL_RECENTS";

  private CallRecentsCardPresenter() {}

  public static void apply(Activity activity, boolean visible, String peerName, String reason) {
    if (activity == null) return;
    try {
      ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
      if (am == null) return;
      int taskId = activity.getTaskId();
      List<ActivityManager.AppTask> tasks = am.getAppTasks();
      if (tasks == null) return;
      for (ActivityManager.AppTask task : tasks) {
        ActivityManager.RecentTaskInfo info = task.getTaskInfo();
        if (info == null || taskIdOf(info) != taskId) continue;
        task.setExcludeFromRecents(!visible);
        break;
      }
      if (visible) applyLabel(activity, peerName);
      Log.i(TAG, "recents_card visible=" + visible + " reason=" + reason);
    } catch (RuntimeException error) {
      Log.w(TAG, "recents_card_failed reason=" + reason + " err=" + error.getClass().getSimpleName());
    }
  }

  private static int taskIdOf(ActivityManager.RecentTaskInfo info) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return info.taskId;
    return info.persistentId;
  }

  @SuppressWarnings("deprecation")
  private static void applyLabel(Activity activity, String peerName) {
    String name = peerName != null ? peerName.trim() : "";
    String label =
        name.isEmpty()
            ? DibayNativeLocale.string(activity, R.string.dibay_call_recents_label_no_name)
            : DibayNativeLocale.string(activity, R.string.dibay_call_recents_label, name);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      activity.setTaskDescription(new ActivityManager.TaskDescription.Builder().setLabel(label).build());
    } else {
      activity.setTaskDescription(new ActivityManager.TaskDescription(label));
    }
  }
}
