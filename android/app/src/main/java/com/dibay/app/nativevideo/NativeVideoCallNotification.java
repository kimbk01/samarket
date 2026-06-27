package com.dibay.app.nativevideo;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.R;

/** Native Video Runtime incoming notification. FSI/PendingIntent is the only Activity launch path. */
public final class NativeVideoCallNotification {
  public static final String CHANNEL_ID = "dibay_native_video_incoming";
  private static final int NOTIFICATION_BASE_ID = 95001;

  private NativeVideoCallNotification() {}

  public static PendingIntent showIncoming(Context context, NativeVideoCallRuntime.Session session) {
    if (context == null || session == null) return null;
    Context app = context.getApplicationContext();
    String sid = session.callId;
    NativeVideoCallLog.info("incoming_notification_post_start", sid);
    ensureChannel(app);
    if (!canPostNotifications(app)) {
      NativeVideoCallLog.warn("error_terminal", sid, "reason=post_notifications_not_granted");
      return null;
    }

    PendingIntent fullScreen = activityIntent(app, session);
    NativeVideoCallLog.info("fullscreen_intent_created", sid);

    Notification notification =
        new NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title(session))
            .setContentText("Incoming DIBAY video call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(0, "Accept", actionIntent(app, session, NativeVideoCallActionReceiver.ACTION_ACCEPT))
            .addAction(0, "Decline", actionIntent(app, session, NativeVideoCallActionReceiver.ACTION_REJECT))
            .build();

    NotificationManagerCompat.from(app).notify(notificationId(sid), notification);
    NativeVideoCallLog.info("incoming_notification_post_done", sid);
    NativeVideoCallLog.info("incoming_notification_fsi_path_kept", sid);
    return fullScreen;
  }

  public static void dismiss(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm != null) nm.cancel(notificationId(callId.trim()));
  }

  private static PendingIntent activityIntent(Context context, NativeVideoCallRuntime.Session session) {
    Intent intent = new Intent(context, NativeVideoCallActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    putSessionExtras(intent, session);
    return PendingIntent.getActivity(
        context,
        requestCode(session.callId, 1),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static PendingIntent actionIntent(
      Context context, NativeVideoCallRuntime.Session session, String action) {
    Intent intent = new Intent(context, NativeVideoCallActionReceiver.class);
    intent.setAction(action);
    putSessionExtras(intent, session);
    return PendingIntent.getBroadcast(
        context,
        requestCode(session.callId, action.hashCode()),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void putSessionExtras(Intent intent, NativeVideoCallRuntime.Session session) {
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, session.callId);
    intent.putExtra("roomId", session.roomId);
    intent.putExtra("callerId", session.callerId);
    intent.putExtra("callerName", session.callerName);
    intent.putExtra("mediaType", session.mediaType);
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "DIBAY Native Video", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Native Video Runtime incoming calls");
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.enableVibration(true);
    nm.createNotificationChannel(channel);
  }

  private static boolean canPostNotifications(Context context) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED;
  }

  private static String title(NativeVideoCallRuntime.Session session) {
    return session.callerName != null && !session.callerName.trim().isEmpty()
        ? session.callerName.trim()
        : "DIBAY video call";
  }

  private static int notificationId(String callId) {
    return NOTIFICATION_BASE_ID + Math.abs(callId.hashCode() % 1000);
  }

  private static int requestCode(String callId, int salt) {
    return Math.abs((callId + ":" + salt).hashCode());
  }
}
