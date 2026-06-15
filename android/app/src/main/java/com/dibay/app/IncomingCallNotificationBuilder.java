package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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
    Uri ringtone = Settings.System.DEFAULT_RINGTONE_URI;
    if (ringtone != null) {
      channel.setSound(
          ringtone,
          new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build());
    }
    nm.createNotificationChannel(channel);
  }

  public static void showIncomingCall(
      Context context, String sessionId, String title, String body, String deepLinkUrl) {
    ensureChannel(context);
    String dibayBase = "dibay://call/" + sessionId;
    Intent launch = incomingCallIntent(context, dibayBase);
    Intent accept = incomingCallIntent(context, appendQueryParam(dibayBase, "action", "accept"));
    Intent reject = incomingCallIntent(context, appendQueryParam(dibayBase, "action", "reject"));

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent fullScreen = PendingIntent.getActivity(context, sessionId.hashCode(), launch, flags);
    PendingIntent content = PendingIntent.getActivity(context, sessionId.hashCode() + 1, launch, flags);
    PendingIntent acceptIntent = PendingIntent.getActivity(context, sessionId.hashCode() + 2, accept, flags);
    PendingIntent rejectIntent = PendingIntent.getActivity(context, sessionId.hashCode() + 3, reject, flags);

    String callerName = resolveCallerDisplayName(title, body);
    String callKindLabel = resolveCallKindLabel(title, body);

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(callerName)
            .setContentText(callKindLabel)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(content)
            .setFullScreenIntent(fullScreen, true)
            .setDefaults(Notification.DEFAULT_VIBRATE);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Person caller = new Person.Builder().setName(callerName).build();
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

  private static Intent incomingCallIntent(Context context, String dibayUrl) {
    Intent intent = new Intent(context, MainActivity.class);
    intent.setAction(Intent.ACTION_VIEW);
    intent.setData(Uri.parse(dibayUrl));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return intent;
  }

  /** FCM title=음성/영상 통화, body=발신자님의 전화 — CallStyle 중복 방지용 분리 */
  private static String resolveCallerDisplayName(String title, String body) {
    String b = body != null ? body.trim() : "";
    if (!b.isEmpty()) {
      if (b.endsWith("님의 전화")) {
        String name = b.substring(0, b.length() - "님의 전화".length()).trim();
        if (!name.isEmpty()) return name;
      }
      return b;
    }
    String t = title != null ? title.trim() : "";
    if (!t.isEmpty() && !isCallKindLabel(t)) return t;
    return "수신 통화";
  }

  private static String resolveCallKindLabel(String title, String body) {
    String t = title != null ? title.trim() : "";
    if (isCallKindLabel(t)) return t;
    String b = body != null ? body.trim() : "";
    if (b.contains("영상")) return "영상 통화";
    if (b.contains("음성")) return "음성 통화";
    return "수신 통화";
  }

  private static boolean isCallKindLabel(String value) {
    return "음성 통화".equals(value) || "영상 통화".equals(value);
  }

  private static String appendQueryParam(String url, String key, String value) {
    Uri uri = Uri.parse(url);
    return uri.buildUpon().appendQueryParameter(key, value).build().toString();
  }
}
