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
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

/**
 * High-priority incoming call notification — FullScreenIntent + CATEGORY_CALL.
 * Channel id {@link #CHANNEL_ID} (spec alias: dibay_incoming_calls).
 */
public final class IncomingCallNotificationBuilder {
  /** Production channel — do not rename (OS channel settings are sticky). */
  public static final String CHANNEL_ID = "dibay_calls_v2";
  /** Spec alias — same channel as {@link #CHANNEL_ID}. */
  public static final String CHANNEL_ID_ALIAS = "dibay_incoming_calls";
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final int INCOMING_CALL_NOTIFICATION_ID = 91001;
  private static volatile String activeIncomingCallId;

  private IncomingCallNotificationBuilder() {}

  public static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
    if (existing != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "수신 통화", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("수신 음성·영상 통화 (alias " + CHANNEL_ID_ALIAS + ")");
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
    showIncomingCall(context, sessionId, title, body, deepLinkUrl, null, null);
  }

  public static void showIncomingCall(
      Context context,
      String sessionId,
      String title,
      String body,
      String deepLinkUrl,
      String callType,
      String expiresAt) {
    ensureChannel(context);

    String previousActive = activeIncomingCallId;
    if (previousActive != null && !previousActive.equals(sessionId)) {
      Log.i(TAG, "[call-flow] busy_rejected activeCallId=" + previousActive + " incomingCallId=" + sessionId);
      new Thread(
              () -> CallSessionPatchHelper.patch(context.getApplicationContext(), sessionId, "reject"))
          .start();
      return;
    }

    activeIncomingCallId = sessionId;
    String callerName = resolveCallerDisplayName(title, body);

    Intent fullScreen = buildIncomingActivityIntent(context, sessionId, callerName, title, body, callType, expiresAt, null);
    Intent content = buildIncomingActivityIntent(context, sessionId, callerName, title, body, callType, expiresAt, null);
    Intent accept = buildIncomingActivityIntent(context, sessionId, callerName, title, body, callType, expiresAt, IncomingCallActivity.ACTION_ACCEPT);
    Intent reject = buildIncomingActivityIntent(context, sessionId, callerName, title, body, callType, expiresAt, IncomingCallActivity.ACTION_DECLINE);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent fullScreenPi = PendingIntent.getActivity(context, sessionId.hashCode(), fullScreen, flags);
    PendingIntent contentPi = PendingIntent.getActivity(context, sessionId.hashCode() + 1, content, flags);
    PendingIntent acceptIntent = PendingIntent.getActivity(context, sessionId.hashCode() + 2, accept, flags);
    PendingIntent rejectIntent = PendingIntent.getActivity(context, sessionId.hashCode() + 3, reject, flags);

    String callKindLabel = resolveCallKindLabel(title, body, callType);

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
            .setContentIntent(contentPi)
            .setFullScreenIntent(fullScreenPi, true)
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
      Log.i(TAG, "[incoming-call-native] full_screen_notification_posted sessionId=" + sessionId);
    }
  }

  public static void dismissIncomingCall(Context context, String sessionId) {
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || sessionId == null) return;
    nm.cancel(INCOMING_CALL_NOTIFICATION_ID + Math.abs(sessionId.hashCode() % 1000));
    if (sessionId.equals(activeIncomingCallId)) {
      activeIncomingCallId = null;
    }
  }

  public static void clearActiveIncomingCallId(String sessionId) {
    if (sessionId != null && sessionId.equals(activeIncomingCallId)) {
      activeIncomingCallId = null;
    }
  }

  private static Intent buildIncomingActivityIntent(
      Context context,
      String sessionId,
      String callerName,
      String title,
      String body,
      String callType,
      String expiresAt,
      String action) {
    Intent intent = new Intent(context, IncomingCallActivity.class);
    if (action != null) intent.setAction(action);
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, sessionId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, callerName);
    intent.putExtra(IncomingCallActivity.EXTRA_TITLE, title);
    intent.putExtra(IncomingCallActivity.EXTRA_BODY, body);
    if (callType != null) intent.putExtra(IncomingCallActivity.EXTRA_CALL_TYPE, callType);
    if (expiresAt != null) intent.putExtra(IncomingCallActivity.EXTRA_EXPIRES_AT, expiresAt);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return intent;
  }

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

  private static String resolveCallKindLabel(String title, String body, String callType) {
    if ("video".equalsIgnoreCase(callType)) return "영상 통화";
    if ("audio".equalsIgnoreCase(callType) || "voice".equalsIgnoreCase(callType)) return "음성 통화";
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
}
