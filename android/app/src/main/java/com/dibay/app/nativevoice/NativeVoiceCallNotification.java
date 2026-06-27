package com.dibay.app.nativevoice;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.R;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;

/** Native Voice Runtime incoming notification. FSI/PendingIntent is the only Activity launch path. */
public final class NativeVoiceCallNotification {
  public static final String CHANNEL_ID = "dibay_native_voice_incoming";
  private static final int NOTIFICATION_BASE_ID = 94001;
  private static final int SUPPRESS_CANCEL_MAX_ATTEMPTS = 8;
  private static final long SUPPRESS_CANCEL_RETRY_MS = 100L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  private NativeVoiceCallNotification() {}

  public static PendingIntent showIncoming(Context context, NativeVoiceCallRuntime.Session session) {
    if (context == null || session == null) return null;
    Context app = context.getApplicationContext();
    String sid = session.callId;
    NativeVoiceCallLog.info("incoming_notification_post_start", sid);
    ensureChannel(app);
    if (!canPostNotifications(app)) {
      NativeVoiceCallLog.warn("error_terminal", sid, "reason=post_notifications_not_granted");
      return null;
    }

    PendingIntent fullScreen = activityIntent(app, session);
    NativeVoiceCallLog.info("fullscreen_intent_created", sid);

    Notification notification =
        new NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title(session))
            .setContentText("Incoming DIBAY voice call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(0, "Accept", actionIntent(app, session, NativeVoiceCallActionReceiver.ACTION_ACCEPT))
            .addAction(0, "Decline", actionIntent(app, session, NativeVoiceCallActionReceiver.ACTION_REJECT))
            .build();

    NotificationManagerCompat.from(app).notify(notificationId(sid), notification);
    NativeVoiceCallLog.info("incoming_notification_post_done", sid);
    NativeVoiceCallLog.info("incoming_notification_fsi_path_kept", sid);
    return fullScreen;
  }

  public static void dismiss(Context context, String callId) {
    cancelVisualNotification(context, callId);
  }

  public static void suppressVisualOnConnected(Context context, String callId) {
    scheduleVerifiedVisualSuppress(context, callId, true);
  }

  public static void suppressVisualAfterActivityShown(Context context, String callId) {
    scheduleVerifiedVisualSuppress(context, callId, false);
  }

  /** Cancel incoming visual and verify StatusBarNotification removal before suppress markers. */
  private static boolean cancelVisualNotification(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    int id = notificationId(sid);
    NativeVoiceCallLog.info("incoming_notification_cancel_start", sid, "notificationId=" + id);

    NotificationManagerCompat compat = NotificationManagerCompat.from(app);
    NotificationManager nm = app.getSystemService(NotificationManager.class);

    // Overwrite ONGOING/FSI call notification, then cancel (Samsung keeps stale entry if cancel-first).
    compat.notify(id, buildCancelReplacement(app));
    compat.cancel(id);
    if (nm != null) nm.cancel(id);

    if (isNotificationActive(nm, app.getPackageName(), id)) {
      NativeVoiceCallLog.warn("incoming_notification_cancel_failed", sid, "notificationId=" + id);
      return false;
    }

    NativeVoiceCallLog.info("incoming_notification_cancel_done", sid, "notificationId=" + id);
    return true;
  }

  private static void scheduleVerifiedVisualSuppress(Context context, String callId, boolean connected) {
    Context app = context.getApplicationContext();
    final int[] attempts = {0};
    final Runnable[] taskRef = new Runnable[1];
    taskRef[0] =
        new Runnable() {
          @Override
          public void run() {
            attempts[0] += 1;
            if (cancelVisualNotification(app, callId)) {
              MAIN.postDelayed(
                  () -> {
                    NotificationManager nm = app.getSystemService(NotificationManager.class);
                    int nid = notificationId(callId.trim());
                    if (isNotificationActive(nm, app.getPackageName(), nid)) {
                      if (attempts[0] < SUPPRESS_CANCEL_MAX_ATTEMPTS) {
                        attempts[0] += 1;
                        MAIN.post(taskRef[0]);
                      }
                      return;
                    }
                    if (connected) {
                      NativeCallVisibleSurfaceOwner.logNotificationVisualSuppressedConnected(callId, "voice");
                    } else {
                      NativeCallVisibleSurfaceOwner.logNotificationVisualSuppressed(callId, "voice");
                    }
                  },
                  300L);
              return;
            }
            if (attempts[0] < SUPPRESS_CANCEL_MAX_ATTEMPTS) {
              MAIN.postDelayed(taskRef[0], SUPPRESS_CANCEL_RETRY_MS);
            }
          }
        };
    if (Looper.myLooper() == Looper.getMainLooper()) taskRef[0].run();
    else MAIN.post(taskRef[0]);
  }

  private static Notification buildCancelReplacement(Context app) {
    return new NotificationCompat.Builder(app, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("")
        .setContentText("")
        .setOngoing(false)
        .setAutoCancel(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .build();
  }

  private static boolean isNotificationActive(NotificationManager nm, String pkg, int id) {
    if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    for (StatusBarNotification sbn : nm.getActiveNotifications()) {
      if (pkg.equals(sbn.getPackageName()) && sbn.getId() == id) return true;
    }
    return false;
  }

  private static PendingIntent activityIntent(Context context, NativeVoiceCallRuntime.Session session) {
    Intent intent = new Intent(context, NativeVoiceCallActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    putSessionExtras(intent, session);
    return PendingIntent.getActivity(
        context,
        requestCode(session.callId, 1),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static PendingIntent actionIntent(
      Context context, NativeVoiceCallRuntime.Session session, String action) {
    Intent intent = new Intent(context, NativeVoiceCallActionReceiver.class);
    intent.setAction(action);
    putSessionExtras(intent, session);
    return PendingIntent.getBroadcast(
        context,
        requestCode(session.callId, action.hashCode()),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void putSessionExtras(Intent intent, NativeVoiceCallRuntime.Session session) {
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, session.callId);
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
        new NotificationChannel(CHANNEL_ID, "DIBAY Native Voice", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Native Voice Runtime incoming calls");
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

  private static String title(NativeVoiceCallRuntime.Session session) {
    return session.callerName != null && !session.callerName.trim().isEmpty()
        ? session.callerName.trim()
        : "DIBAY voice call";
  }

  private static int notificationId(String callId) {
    return NOTIFICATION_BASE_ID + Math.abs(callId.hashCode() % 1000);
  }

  private static int requestCode(String callId, int salt) {
    return Math.abs((callId + ":" + salt).hashCode());
  }
}
