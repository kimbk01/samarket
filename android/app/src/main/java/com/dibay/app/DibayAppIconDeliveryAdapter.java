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
      Log.i(TAG, "summary_cleared total=0");
      return;
    }

    postOrUpdateSummary(app, nm, n);
    Log.i(TAG, "summary_applied total=" + n);
  }

  /**
   * Domain tray posted (FCM). Keep summary as sole badge carrier with latest total.
   * Does not write setNumber onto domain children. Does not cancel summary.
   */
  public static void onDomainNotificationPosted(Context context, int appIconTotal) {
    apply(context, appIconTotal);
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
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setNumber(total)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(false)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

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
