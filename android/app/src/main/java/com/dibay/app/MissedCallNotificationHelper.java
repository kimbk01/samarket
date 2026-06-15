package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/** Missed call notification — tap opens call logs, no redial action. */
public final class MissedCallNotificationHelper {
  private static final String TAG = "DIBAY_MISSED_CALL";

  private MissedCallNotificationHelper() {}

  public static void show(
      Context context, String title, String body, String routeUrl, String callId, String tag) {
    DibayFirebaseMessagingService.ensureMessagesChannelStatic(context);
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (routeUrl != null && !routeUrl.isEmpty()) {
      launch.putExtra("url", routeUrl);
    }
    launch.putExtra("type", "missed_call");
    if (callId != null) launch.putExtra("callId", callId);
    String notificationId = tag != null ? tag : (callId != null ? "missed:" + callId : null);
    if (notificationId != null) launch.putExtra("notificationId", notificationId);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    int requestCode = notificationId != null ? notificationId.hashCode() : (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
    PendingIntent pi = PendingIntent.getActivity(context, requestCode, launch, flags);

    String safeTitle = title != null && !title.isEmpty() ? title : "부재중 통화";
    String safeBody = body != null ? body : "";

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(context, DibayFirebaseMessagingService.MESSAGES_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(Notification.DEFAULT_ALL);

    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify(requestCode, builder.build());
      Log.i(TAG, "[missed-call] notification_created callId=" + callId);
    }
  }
}
