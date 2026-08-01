package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Android Delivery Adapter v1 — S3.
 *
 * Sole duty: deliver projected {@code appIconTotal} to the Android Launcher via
 * {@code Notification.setNumber}. Does not compute Badge/Bell/RoomUnread.
 *
 * <ul>
 *   <li>Domain tray present → cancel summary; launcher uses domain notifications' numbers
 *   <li>Domain tray empty and total &gt; 0 → one product summary notification + setNumber
 *   <li>total == 0 → cancel summary immediately
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
   * Echo Capawesome badge SharedPreferences into Delivery Adapter.
   * Lets launcher delivery work before remote Web JS ships the plugin call.
   */
  public static void applyFromCapBadgeCache(Context context) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    // Capawesome Badge.java: SharedPreferences name + key = "capacitor.badge"
    SharedPreferences prefs = app.getSharedPreferences("capacitor.badge", Context.MODE_PRIVATE);
    int cached = prefs.getInt("capacitor.badge", 0);
    apply(app, cached);
  }

  /** Apply absolute appIconTotal to Android launcher delivery. */
  public static void apply(Context context, int appIconTotal) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    int n = Math.max(0, Math.min(999, appIconTotal));
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm == null) {
      Log.e(TAG, "notification_manager_null");
      return;
    }

    // Drop debug probe leftovers so they cannot block S3 summary.
    nm.cancel(710032);

    if (n <= 0) {
      cancelSummary(nm);
      Log.i(TAG, "apply clear total=0 summary_cancelled");
      return;
    }

    if (hasActiveDomainNotification(nm)) {
      cancelSummary(nm);
      Log.i(TAG, "apply domain_tray_present total=" + n + " summary_cancelled");
      return;
    }

    postOrUpdateSummary(app, nm, n);
    Log.i(TAG, "apply summary_posted total=" + n);
  }

  /** Call when a real domain tray notification is posted (FCM). */
  public static void onDomainNotificationPosted(Context context, int appIconTotal) {
    if (context == null) return;
    NotificationManager nm = context.getApplicationContext().getSystemService(NotificationManager.class);
    if (nm == null) return;
    cancelSummary(nm);
    Log.i(TAG, "on_domain_posted summary_cancelled total=" + Math.max(0, appIconTotal));
  }

  public static void cancelSummary(Context context) {
    if (context == null) return;
    NotificationManager nm = context.getApplicationContext().getSystemService(NotificationManager.class);
    if (nm != null) cancelSummary(nm);
  }

  private static void cancelSummary(NotificationManager nm) {
    nm.cancel(SUMMARY_NOTIFICATION_ID);
  }

  private static boolean hasActiveDomainNotification(NotificationManager nm) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    StatusBarNotification[] active;
    try {
      active = nm.getActiveNotifications();
    } catch (Exception e) {
      Log.w(TAG, "getActiveNotifications_failed", e);
      return false;
    }
    if (active == null) return false;
    for (StatusBarNotification sbn : active) {
      if (sbn == null) continue;
      if (sbn.getId() == SUMMARY_NOTIFICATION_ID) continue;
      Notification n = sbn.getNotification();
      if (n == null) continue;
      String channelId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? n.getChannelId() : null;
      if (channelId == null || channelId.trim().isEmpty()) {
        // Pre-O or missing channel: treat as domain if not our summary id
        return true;
      }
      String id = channelId.trim();
      if (SUMMARY_CHANNEL_ID.equals(id)) continue;
      if (DibayNotificationChannelRegistry.isCallChannelId(id)) continue;
      if (id.contains("badge_silent_probe")) continue;
      // Real user message / trade / order / admin tray only (S3 domain carrier)
      if (DibayNotificationChannelRegistry.isAllowedMessageChannelId(id)) return true;
    }
    return false;
  }

  private static void ensureSummaryChannel(NotificationManager nm) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    if (nm.getNotificationChannel(SUMMARY_CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(
            SUMMARY_CHANNEL_ID,
            "읽지 않은 알림",
            NotificationManager.IMPORTANCE_DEFAULT);
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
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) {
        Log.w(TAG, "notifications_disabled_skip_summary total=" + total);
        return;
      }
    }

    nm.notify(SUMMARY_NOTIFICATION_ID, builder.build());
  }
}
