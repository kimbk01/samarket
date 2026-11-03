package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import me.leolin.shortcutbadger.ShortcutBadger;

/**
 * Android Delivery Adapter — App Icon Badge single-carrier SSOT.
 *
 * Sole duty: deliver projected {@code appIconTotal} to the Android Launcher via
 * exactly one summary notification (number = total − tray units, so the launcher sum equals total)
 * and the launcher badge provider (total). Does not compute Badge/Bell/RoomUnread.
 *
 * <ul>
 *   <li>{@code dibay_app_icon_summary_v1} is the only App Icon Badge carrier
 *   <li>Domain tray notifications never carry launcher badge authority
 *   <li>Domain children keep number 0 (counted as 1 each by number-showing launchers); summary
 *       number absorbs the rest. Summary withheld only while tray units alone reach total; restored on
 *       child dismiss (deleteIntent) and app background (plugin onStop)
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
  /**
   * 요약 카드 순서 시각 = 게시 시각 − 13일(게시마다 계산).
   * - 앱 지정 when 이어야 순서 시각으로 쓰인다(Notification.hasAppProvidedWhen: when≠0·≠생성 시각).
   * - 14일보다 오래된 앱 지정 when 은 게시 자체가 거부된다(NotificationManagerService NOTIFICATION_MAX_AGE_AT_POST,
   *   빌드 35 에서 when=1 로 확인) → 13일.
   * docs/audit/android-summary-card-deep-analysis-2026-11-04.md
   */
  static final long SUMMARY_RANKING_AGE_MS = 13L * 24L * 60L * 60L * 1000L;

  static long summaryRankingWhenMs(long nowMs) {
    return nowMs - SUMMARY_RANKING_AGE_MS;
  }

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

  private static final String PREFS = "dibay_app_icon_delivery";
  private static final String KEY_LAST_TOTAL = "last_total";

  /** Apply absolute appIconTotal to Android launcher delivery (summary carrier only). */
  public static void apply(Context context, int appIconTotal) {
    applyExcluding(context, appIconTotal, NO_EXCLUDED_ID);
  }

  private static final int NO_EXCLUDED_ID = Integer.MIN_VALUE;

  /**
   * 숫자 표시 런처는 앱 알림마다 max(1, number) 를 더해 아이콘 숫자로 보인다 — 실기 2026-11-04(요약 60 + 일반
   * 알림 1장 = 아이콘 61, 1장 지우자 60) · 제조사 공식 문서「아이콘 숫자 = 앱 알림 수」(상주·진행률 제외) · AOSP
   * Launcher3 NotificationKeyData `Math.max(1, notif.number)` 합산. 그래서 요약 카드 숫자 = 총수 − 알림창 일반
   * 알림 몫(trayUnits) 으로 두어 합이 총수가 되게 한다. 런처 숫자 저장소(ShortcutBadger)에는 총수를 그대로 쓴다.
   * docs/audit/app-icon-badge-plus1-proof-and-design-2026-11-04.md
   */
  static void applyExcluding(Context context, int appIconTotal, int excludedNotificationId) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    int n = Math.max(0, Math.min(999, appIconTotal));
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm == null) {
      Log.e(TAG, "notification_manager_null");
      return;
    }
    rememberTotal(app, n);

    // Drop debug probe leftovers so they cannot share badge authority.
    nm.cancel(710032);

    if (n <= 0) {
      cancelSummary(nm);
      applyLauncherBadgeProvider(app, 0);
      Log.i(TAG, "summary_cleared total=0");
      return;
    }

    applyLauncherBadgeProvider(app, n);
    int tray = trayBadgeUnits(nm, excludedNotificationId);
    int summaryNumber = summaryNumberFor(n, tray);
    if (summaryNumber <= 0) {
      // 알림창 일반 알림만으로 이미 총수 이상 — 요약 카드(최소 1로 세어짐)를 두면 더 커진다. 일반 알림이 지워지면
      // 지움 감지·앱 백그라운드 전환 때 다시 계산해 요약 카드를 되살린다.
      cancelSummary(nm);
      Log.i(TAG, "summary_applied total=" + n + " tray=" + tray + " number=0 summary_withheld");
      return;
    }
    postOrUpdateSummary(app, nm, n, summaryNumber);
    Log.i(TAG, "summary_applied total=" + n + " tray=" + tray + " number=" + summaryNumber);
  }

  /** 요약 카드 숫자 — 런처 합(요약 + 일반 알림 몫)이 총수가 되게. 0 이하면 요약 카드를 두지 않는다. */
  static int summaryNumberFor(int total, int trayUnits) {
    return total - Math.max(0, trayUnits);
  }

  /**
   * 알림창의 DIBAY 일반 알림 몫 합 — 각 max(1, number). 요약 카드 자신·지금 지워지는 알림·묶음 머리(시스템 자동 묶음
   * 머리 포함)·상주 알림(통화 진행 등 — 제조사 문서·AOSP 모두 숫자에서 뺌)은 제외. 읽기 실패 시 0(종전 동작).
   */
  static int trayBadgeUnits(NotificationManager nm, int excludedNotificationId) {
    try {
      int units = 0;
      for (StatusBarNotification sbn : nm.getActiveNotifications()) {
        if (sbn == null || sbn.getNotification() == null) continue;
        int id = sbn.getId();
        if (id == SUMMARY_NOTIFICATION_ID || id == excludedNotificationId) continue;
        int flags = sbn.getNotification().flags;
        if ((flags & Notification.FLAG_GROUP_SUMMARY) != 0) continue;
        if ((flags & Notification.FLAG_ONGOING_EVENT) != 0) continue;
        if ((flags & Notification.FLAG_FOREGROUND_SERVICE) != 0) continue;
        units += Math.max(1, sbn.getNotification().number);
      }
      return units;
    } catch (Throwable t) {
      Log.w(TAG, "tray_units_failed err=" + t.getClass().getSimpleName());
      return 0;
    }
  }

  private static void rememberTotal(Context app, int total) {
    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY_LAST_TOTAL, total).apply();
  }

  /** 마지막으로 받은 총수로 다시 계산 — 일반 알림 지움 감지·앱 백그라운드 전환 때. 총수를 받은 적 없으면 아무것도 안 함. */
  public static void reapplyLast(Context context, int excludedNotificationId) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    android.content.SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.contains(KEY_LAST_TOTAL)) return;
    applyExcluding(app, prefs.getInt(KEY_LAST_TOTAL, 0), excludedNotificationId);
  }

  public static void reapplyLast(Context context) {
    reapplyLast(context, NO_EXCLUDED_ID);
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

  private static void postOrUpdateSummary(Context app, NotificationManager nm, int total, int summaryNumber) {
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
            // 런처 합 = 이 숫자 + 알림창 일반 알림 몫 = 총수 (applyExcluding 설명). 본문 문구는 총수.
            .setNumber(summaryNumber)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            // Carrier must survive tap/open; only apply(0) cancels (Authority clear).
            .setAutoCancel(false)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // 순서 시각을 과거로 — 이 카드는 알림이 올 때마다 다시 게시돼 「게시 시각」 기준이면 늘 가장 최신이 되고,
            // 시각 순서로 정렬하는 기기(실기 v3 dumpsys `intrsv=2`)에서 시스템 묶음 앞면을 차지해 실제 알림을 가렸다.
            // Android 는 앱이 지정한 when(≤게시 시각)을 순서 시각으로 쓴다(NotificationRecord.calculateRankingTimeMs).
            .setWhen(summaryRankingWhenMs(System.currentTimeMillis()))
            .setShowWhen(false)
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
