package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationCompat;

/**
 * Messenger-style incoming call notification — system call category with accept/decline actions.
 *
 * <p>Foreground unlocked uses {@link ForegroundIncomingCallActivity} pill. Lock/screen-off uses
 * notification actions plus optional full-screen intent bridge ({@link IncomingCallActivity}).
 */
public final class IncomingCallNotificationBuilder {
  /** Production channel — do not rename (OS channel settings are sticky). */
  public static final String CHANNEL_ID = "dibay_incoming_calls_v2";
  /** Spec alias — same channel as {@link #CHANNEL_ID}. */
  public static final String CHANNEL_ID_ALIAS = "dibay_incoming_calls";
  public static final int INCOMING_CALL_NOTIFICATION_BASE_ID = 91001;
  private static final String TAG = "DIBAY_INCOMING_CALL";

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

  public static boolean canPostNotifications(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED;
  }

  /** Android 14+ full-screen intent permission — required for lock-screen incoming bridge. */
  public static boolean canPostFullScreenIntent(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    return nm != null && nm.canUseFullScreenIntent();
  }

  /** Opens system settings when {@link #canPostFullScreenIntent} is false (Android 14+). */
  public static void openFullScreenIntentSettings(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return;
    try {
      Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
      intent.setData(Uri.fromParts("package", context.getPackageName(), null));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
    } catch (Exception error) {
      Log.w(TAG, "[incoming-call-native] fsi_settings_open_failed " + error.getMessage());
    }
  }

  public static void showIncomingCall(
      Context context, String sessionId, String title, String body, String deepLinkUrl) {
    showIncomingCall(context, sessionId, title, body, deepLinkUrl, null, null);
  }

  public static void showIncomingCall(Context context, IncomingCallPayload payload) {
    if (payload == null || !payload.isValid()) return;
    showIncomingCall(
        context,
        payload.callId,
        payload.title,
        payload.body,
        null,
        payload.callType,
        payload.expiresAt,
        payload.roomId,
        payload.callerId,
        payload.callerName,
        payload.callerAvatarUrl);
  }

  public static void showIncomingCall(
      Context context,
      String sessionId,
      String title,
      String body,
      String deepLinkUrl,
      String callType,
      String expiresAt) {
    showIncomingCall(context, sessionId, title, body, deepLinkUrl, callType, expiresAt, null, null, null, null);
  }

  public static void showIncomingCall(
      Context context,
      String sessionId,
      String title,
      String body,
      String deepLinkUrl,
      String callType,
      String expiresAt,
      String roomId,
      String callerId,
      String callerNameFromPayload,
      String callerAvatarUrl) {
    ensureChannel(context);
    if (sessionId == null || sessionId.trim().isEmpty()) return;
    String sid = sessionId.trim();
    boolean firstIncoming = IncomingCallActionCoordinator.registerIncoming(context, sid);
    if (!firstIncoming) {
      return;
    }

    boolean notificationAllowed = canPostNotifications(context);
    if (!notificationAllowed) {
      Log.w(TAG, "[call-push] post_notifications_denied callId=" + sid);
    }
    boolean lockScreenBridge =
        DibayKeyguardHelper.isKeyguardLocked(context) || !DibayKeyguardHelper.isInteractive(context);
    boolean fsiAllowed = canPostFullScreenIntent(context);
    Log.i(
        TAG,
        "[call-push] lock_bridge="
            + lockScreenBridge
            + " fsiAllowed="
            + fsiAllowed
            + " callId="
            + sid);

    String callerName = IncomingCallUiCopy.callerDisplayName(callerNameFromPayload, title, body);
    String callKindLabel = IncomingCallUiCopy.statusBrandLabel(context, callType, title, body);
    String rejectLabel = IncomingCallUiCopy.rejectLabel(context);
    String acceptLabel = IncomingCallUiCopy.acceptLabel(context);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }

    IncomingCallPayload fsiPayload =
        new IncomingCallPayload(
            sid,
            roomId,
            callerId,
            callerName,
            callerAvatarUrl,
            callType != null && "video".equalsIgnoreCase(callType) ? "video" : "audio",
            expiresAt,
            title,
            body,
            null);

    Intent accept = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, fsiPayload);
    if (accept != null) {
      accept.setAction(IncomingCallActivity.ACTION_ACCEPT);
    } else {
      accept = new Intent(context, IncomingCallActivity.class);
      accept.setAction(IncomingCallActivity.ACTION_ACCEPT);
      accept.putExtra(IncomingCallActivity.EXTRA_CALL_ID, sid);
      accept.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }
    PendingIntent acceptPi = PendingIntent.getActivity(context, sid.hashCode() + 2, accept, flags);
    Intent content = IncomingCallIntentHelper.buildMainActivityCallPreviewIntent(context, sid);
    PendingIntent contentPi = PendingIntent.getActivity(context, sid.hashCode() + 1, content, flags);

    Intent fullScreen = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, fsiPayload);
    PendingIntent fullScreenPi = null;
    if (fullScreen != null) {
      fullScreenPi = PendingIntent.getActivity(context, sid.hashCode() + 4, fullScreen, flags);
    }

    Intent decline = new Intent(context, IncomingCallDeclineReceiver.class);
    decline.setAction(IncomingCallDeclineReceiver.ACTION_DECLINE);
    decline.putExtra(IncomingCallDeclineReceiver.EXTRA_CALL_ID, sid);
    PendingIntent declinePi =
        PendingIntent.getBroadcast(context, sid.hashCode() + 3, decline, flags);

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(callerName)
            .setContentText(callKindLabel)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(callKindLabel))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPi)
            .setDefaults(Notification.DEFAULT_ALL)
            .addAction(R.drawable.ic_dibay_incoming_reject, rejectLabel, declinePi)
            .addAction(R.drawable.ic_dibay_incoming_accept, acceptLabel, acceptPi);
    if (firstIncoming && lockScreenBridge && fsiAllowed && fullScreenPi != null) {
      builder.setFullScreenIntent(fullScreenPi, true);
      Log.i(TAG, "[call-notification] fsi_attached callId=" + sid);
    } else if (firstIncoming && lockScreenBridge && !fsiAllowed) {
      Log.w(TAG, "[call-notification] fsi_skipped_denied callId=" + sid);
    }

    int notificationId = INCOMING_CALL_NOTIFICATION_BASE_ID + Math.abs(sid.hashCode() % 1000);
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify(notificationId, builder.build());
      DibayCallLog.once("notification_created", sid, "source=notification");
      Log.i(TAG, "[call-notification] incoming_posted callId=" + sid + " first=" + firstIncoming);
    }
  }

  public static void dismissIncomingCall(Context context, String sessionId) {
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || sessionId == null) return;
    String sid = sessionId.trim();
    if (sid.isEmpty()) return;
    nm.cancel(INCOMING_CALL_NOTIFICATION_BASE_ID + Math.abs(sid.hashCode() % 1000));
    DibayCallLog.once("notification_cancel", sid);
  }

  public static void clearActiveIncomingCallId(String sessionId) {
    /* no-op — activeIncomingCallId gate removed */
  }
}
