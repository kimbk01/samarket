package com.dibay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import me.leolin.shortcutbadger.ShortcutBadger;

/**
 * Android Delivery Adapter — App Icon Badge single-carrier SSOT.
 *
 * Sole duty: deliver projected {@code appIconTotal} to the Android Launcher via
 * exactly one summary notification {@code setNumber(total)}. Does not compute
 * Badge/Bell/RoomUnread.
 *
 * <ul>
 *   <li>{@code dibay_app_icon_summary_v1} is the only App Icon Badge carrier
 *   <li>Domain tray notifications never carry launcher badge authority
 *   <li>Domain tray present → keep/update summary (do not cancel)
 *   <li>total == 0 → cancel summary only (do not cancel domain children)
 *   <li>AutoCancel false — tap/open must not drop carrier while Authority &gt; 0
 *   <li>Never writes notification_events / Bell
 * </ul>
 */
public final class DibayAppIconDeliveryAdapter {
  private static final String TAG = "DIBAY_APPICON_DELIVERY";
  public static final String SUMMARY_CHANNEL_ID = "dibay_app_icon_summary_v1";
  public static final int SUMMARY_NOTIFICATION_ID = 710001;
  private static final String SUMMARY_ROUTE = "/notifications";

  private DibayAppIconDeliveryAdapter() {}

  /**
   * Gate 3 Step 11 — Cap prefs are NOT App Icon authority.
   * Versionless {@code capacitor.badge} must never final-publish on resume/cold/warm.
   * Final paint: Web Domain snapshot → syncNativeBadgeCount → {@link #apply}.
   * Returns {@code false} (rejected); leaves existing launcher badge unchanged.
   */
  public static boolean applyFromCapBadgeCache(Context context) {
    if (context == null) return false;
    Log.i(TAG, "cap_cache_paint_rejected reason=VERSION_REQUIRED_OR_RESUME_FORBIDDEN");
    return false;
  }

  /** Apply absolute appIconTotal to Android launcher delivery (summary carrier only). */
  public static void apply(Context context, int appIconTotal) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    int n = Math.max(0, Math.min(999, appIconTotal));
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm == null) {
      Log.e(TAG, "notification_manager_null");
      return;
    }

    // Drop debug probe leftovers so they cannot share badge authority.
    nm.cancel(710032);

    if (n <= 0) {
      cancelSummary(nm);
      applyLauncherBadgeProvider(app, 0);
      Log.i(TAG, "summary_cleared total=0");
      return;
    }

    postOrUpdateSummary(app, nm, n);
    applyLauncherBadgeProvider(app, n);
    Log.i(TAG, "summary_applied total=" + n);
  }

  /**
   * B1 (알림 실기 2026-10-28 · Owner 승인): 일부 런처는 summary {@code number} 보다 launcher badge provider
   * 값을 우선 표시한다. 웹 {@code Badge.set} 만 provider 를 쓰면 백그라운드 FCM 반영 때 런처가 마지막 앞 화면
   * 값에 머문다. summary 와 같은 값을 provider 에도 쓴다(지원하지 않는 런처는 무시).
   */
  private static void applyLauncherBadgeProvider(Context app, int n) {
    try {
      boolean ok = ShortcutBadger.applyCount(app, n);
      Log.i(TAG, "launcher_provider_applied total=" + n + " ok=" + ok);
    } catch (Throwable t) {
      Log.w(TAG, "launcher_provider_failed total=" + n + " err=" + t.getClass().getSimpleName());
    }
  }

  /**
   * Domain tray posted (FCM, 일반 알림 경로에서만 호출 — 통화 경로는 호출하지 않음).
   *
   * <p>B-16 (알림 재감사 · Owner 승인 2026-10-28): 앱이 백그라운드·종료 상태면 웹 NativeBadgeSync 가 돌지 않아
   * 런처 숫자가 갱신되지 않았다. 이때는 서버가 발송 시점에 계산한 A+B ({@code badgeCount}, 서버
   * memberAppIconAuthority)를 summary carrier 에 반영한다. 앱이 보이는 동안은 웹 권위만 쓴다(덮어쓰지 않음).
   * 값이 0 이하(필드 없음·파싱 실패 포함)면 기존 숫자를 지우지 않고 그대로 둔다.
   */
  public static void onDomainNotificationPosted(Context context, int appIconTotal) {
    int total = Math.max(0, appIconTotal);
    if (MainActivity.isAppVisibleForIncomingCall()) {
      Log.i(TAG, "fcm_hint_ignored_foreground total=" + total);
      return;
    }
    if (total <= 0) {
      Log.i(TAG, "fcm_hint_ignored_nonpositive total=" + total);
      return;
    }
    apply(context, total);
    Log.i(TAG, "fcm_background_applied total=" + total);
  }

  public static void cancelSummary(Context context) {
    if (context == null) return;
    NotificationManager nm = context.getApplicationContext().getSystemService(NotificationManager.class);
    if (nm != null) cancelSummary(nm);
  }

  private static void cancelSummary(NotificationManager nm) {
    nm.cancel(SUMMARY_NOTIFICATION_ID);
  }

  private static void ensureSummaryChannel(NotificationManager nm) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationChannel existing = nm.getNotificationChannel(SUMMARY_CHANNEL_ID);
    if (existing != null) {
      // Ensure badge carrier stays enabled even if OEM/user demoted sound.
      if (!existing.canShowBadge()) {
        existing.setShowBadge(true);
        nm.createNotificationChannel(existing);
      }
      return;
    }
    NotificationChannel channel =
        new NotificationChannel(
            SUMMARY_CHANNEL_ID,
            "읽지 않은 알림",
            NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("App Icon delivery — unread summary (not Bell)");
    channel.setShowBadge(true);
    channel.enableVibration(false);
    channel.setSound(null, null);
    nm.createNotificationChannel(channel);
    Log.i(TAG, "summary_channel_created id=" + SUMMARY_CHANNEL_ID);
  }

  private static void postOrUpdateSummary(Context app, NotificationManager nm, int total) {
    ensureSummaryChannel(nm);

    Intent launch = new Intent(app, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("url", SUMMARY_ROUTE);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent pi =
        PendingIntent.getActivity(app, SUMMARY_NOTIFICATION_ID, launch, flags);

    String title = app.getString(R.string.dibay_app_icon_summary_title);
    String body = app.getString(R.string.dibay_app_icon_summary_body, total);

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(app, SUMMARY_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setNumber(total)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            // Carrier must survive tap/open; only apply(0) cancels (Authority clear).
            .setAutoCancel(false)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // 요약 카드만 자기 묶음 — 묶음 키가 없으면 One UI 가 DIBAY 알림 2개부터 앱 자동 묶음으로 합쳐
            // 메시지가 이 카드 밑에 숨는다(실기 빌드 17). 일반 알림은 묶음 키 없이 둔다(빌드 16 묶음 실기).
            .setGroup("dibay.app_icon_summary");
    DibayNotificationPresentation.applyBrand(app, builder);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) {
        Log.w(TAG, "apply_failed notifications_disabled total=" + total);
        return;
      }
    }

    // Fixed id → idempotent upsert; never creates a second summary carrier.
    nm.notify(SUMMARY_NOTIFICATION_ID, builder.build());
  }
}
