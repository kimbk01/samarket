package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

/**
 * High-priority incoming call notification — FullScreenIntent + CATEGORY_CALL.
 */
public final class IncomingCallNotificationBuilder {
  public static final String CHANNEL_ID = "dibay_calls_v2";
  private static final int INCOMING_CALL_NOTIFICATION_ID = 91001;

  private IncomingCallNotificationBuilder() {}

  public static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
    if (existing != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "수신 통화", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("수신 음성·영상 통화");
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setBypassDnd(true);
    nm.createNotificationChannel(channel);
  }

  public static void showIncomingCall(Context context, String sessionId, String title, String body, String deepLinkUrl) {
    ensureChannel(context);
    String baseUrl = deepLinkUrl != null && !deepLinkUrl.isEmpty() ? deepLinkUrl : "dibay://call/" + sessionId;
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(Uri.parse(baseUrl));
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    Intent accept = new Intent(context, MainActivity.class);
    accept.setAction(Intent.ACTION_VIEW);
    accept.setData(Uri.parse(appendQueryParam(baseUrl, "action", "accept")));
    accept.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    Intent reject = new Intent(context, MainActivity.class);
    reject.setAction(Intent.ACTION_VIEW);
    reject.setData(Uri.parse(appendQueryParam(baseUrl, "action", "reject")));
    reject.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent fullScreen = PendingIntent.getActivity(context, sessionId.hashCode(), launch, flags);
    PendingIntent content = PendingIntent.getActivity(context, sessionId.hashCode() + 1, launch, flags);
    PendingIntent acceptIntent = PendingIntent.getActivity(context, sessionId.hashCode() + 2, accept, flags);
    PendingIntent rejectIntent = PendingIntent.getActivity(context, sessionId.hashCode() + 3, reject, flags);
    String safeTitle = title != null && !title.isEmpty() ? title : "수신 통화";
    String safeBody = body != null ? body : "";

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(content)
            .setFullScreenIntent(fullScreen, true)
            .setDefaults(Notification.DEFAULT_ALL);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Person caller = new Person.Builder().setName(safeBody.isEmpty() ? safeTitle : safeBody).build();
      builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, rejectIntent, acceptIntent));
    } else {
      builder
          .addAction(R.mipmap.ic_launcher, "거절", rejectIntent)
          .addAction(R.mipmap.ic_launcher, "수락", acceptIntent);
    }

    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify(INCOMING_CALL_NOTIFICATION_ID + Math.abs(sessionId.hashCode() % 1000), builder.build());
    }
  }

  public static void dismissIncomingCall(Context context, String sessionId) {
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || sessionId == null) return;
    nm.cancel(INCOMING_CALL_NOTIFICATION_ID + Math.abs(sessionId.hashCode() % 1000));
  }

  private static String appendQueryParam(String url, String key, String value) {
    Uri uri = Uri.parse(url);
    return uri.buildUpon().appendQueryParameter(key, value).build().toString();
  }
}
