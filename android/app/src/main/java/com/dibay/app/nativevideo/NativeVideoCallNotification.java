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
import android.os.Handler;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.R;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Native Video Runtime incoming notification. Accept/FSI/content use Activity PendingIntent only. */
public final class NativeVideoCallNotification {
  public static final String CHANNEL_ID = "dibay_native_video_incoming";
  private static final int NOTIFICATION_BASE_ID = 95001;
  private static final int SUPPRESS_CANCEL_MAX_ATTEMPTS = 8;
  private static final long SUPPRESS_CANCEL_RETRY_MS = 100L;
  /** RINGING-only: keep Accept action PI reachable briefly after FSI Activity shown. */
  private static final long ACTIVITY_SHOWN_RINGING_SUPPRESS_GRACE_MS = 1_000L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final Map<String, Runnable> pendingGraceSuppress = new ConcurrentHashMap<>();

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
            .addAction(0, "Accept", acceptActivityIntent(app, session))
            .addAction(0, "Decline", declineIntent(app, session))
            .build();

    NotificationManagerCompat.from(app).notify(notificationId(sid), notification);
    NativeVideoCallLog.info("incoming_notification_post_done", sid);
    NativeVideoCallLog.info("incoming_notification_fsi_path_kept", sid);
    return fullScreen;
  }

  public static void dismiss(Context context, String callId) {
    cancelPendingGraceSuppress(callId);
    cancelVisualNotification(context, callId);
  }

  public static void suppressVisualOnConnected(Context context, String callId) {
    cancelPendingGraceSuppress(callId);
    scheduleVerifiedVisualSuppress(context, callId, true);
  }

  public static void suppressVisualAfterActivityShown(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(sid);
    if (session != null && session.state == NativeVideoCallRuntime.State.RINGING) {
      scheduleRingingGraceSuppress(app, sid);
      return;
    }
    scheduleVerifiedVisualSuppress(app, sid, false);
  }

  private static void scheduleRingingGraceSuppress(Context app, String callId) {
    Runnable graceTask =
        () -> {
          pendingGraceSuppress.remove(callId);
          NativeVideoCallRuntime.Session current = NativeVideoCallRuntime.getSession(callId);
          if (current != null && current.state != NativeVideoCallRuntime.State.RINGING) {
            NativeVideoCallLog.info(
                "incoming_notification_suppress_grace_skipped",
                callId,
                "reason=state_" + current.state.name().toLowerCase());
            return;
          }
          NativeVideoCallLog.info(
              "incoming_notification_suppress_grace_elapsed",
              callId,
              "graceMs=" + ACTIVITY_SHOWN_RINGING_SUPPRESS_GRACE_MS);
          scheduleVerifiedVisualSuppress(app, callId, false);
        };
    Runnable previous = pendingGraceSuppress.put(callId, graceTask);
    if (previous != null) MAIN.removeCallbacks(previous);
    NativeVideoCallLog.info(
        "incoming_notification_suppress_grace_scheduled",
        callId,
        "graceMs=" + ACTIVITY_SHOWN_RINGING_SUPPRESS_GRACE_MS);
    MAIN.postDelayed(graceTask, ACTIVITY_SHOWN_RINGING_SUPPRESS_GRACE_MS);
  }

  private static void cancelPendingGraceSuppress(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    Runnable pending = pendingGraceSuppress.remove(callId.trim());
    if (pending != null) MAIN.removeCallbacks(pending);
  }

  /** Cancel incoming visual and verify StatusBarNotification removal before suppress markers. */
  private static boolean cancelVisualNotification(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    int id = notificationId(sid);
    NativeVideoCallLog.info("incoming_notification_cancel_start", sid, "notificationId=" + id);

    NotificationManagerCompat compat = NotificationManagerCompat.from(app);
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    logActiveNotificationState(nm, sid, id, "before_cancel");

    // Overwrite ONGOING/FSI call notification, then cancel (Samsung keeps stale entry if cancel-first).
    compat.notify(id, buildCancelReplacement(app));
    logActiveNotificationState(nm, sid, id, "after_replacement_notify");
    compat.cancel(id);
    if (nm != null) nm.cancel(id);
    logActiveNotificationState(nm, sid, id, "after_cancel");

    if (isNotificationActive(nm, app.getPackageName(), id)) {
      NativeVideoCallLog.warn("incoming_notification_cancel_failed", sid, "notificationId=" + id);
      return false;
    }

    NativeVideoCallLog.info("incoming_notification_cancel_done", sid, "notificationId=" + id);
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
                    logActiveNotificationState(nm, callId.trim(), nid, "delayed_verify");
                    if (isNotificationActive(nm, app.getPackageName(), nid)) {
                      NativeVideoCallLog.warn(
                          "incoming_notification_cancel_failed", callId, "notificationId=" + nid + " phase=delayed_verify");
                      if (attempts[0] < SUPPRESS_CANCEL_MAX_ATTEMPTS) {
                        attempts[0] += 1;
                        MAIN.post(taskRef[0]);
                      }
                      return;
                    }
                    if (connected) {
                      NativeCallVisibleSurfaceOwner.logNotificationVisualSuppressedConnected(callId, "video");
                    } else {
                      NativeCallVisibleSurfaceOwner.logNotificationVisualSuppressed(callId, "video");
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

  private static void logActiveNotificationState(NotificationManager nm, String callId, int id, String phase) {
    if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      NativeVideoCallLog.info(
          "incoming_notification_active_state", callId, "phase=" + phase + " notificationId=" + id + " active=unknown");
      return;
    }
    int matched = 0;
    StringBuilder details = new StringBuilder();
    for (StatusBarNotification sbn : nm.getActiveNotifications()) {
      if (!sbn.getPackageName().equals("com.dibay.app") || sbn.getId() != id) continue;
      matched += 1;
      Notification notification = sbn.getNotification();
      if (details.length() > 0) details.append(";");
      details
          .append("tag=")
          .append(sbn.getTag())
          .append(",flags=")
          .append(notification != null ? notification.flags : 0)
          .append(",channel=")
          .append(notification != null ? notification.getChannelId() : "unknown");
    }
    NativeVideoCallLog.info(
        "incoming_notification_active_state",
        callId,
        "phase=" + phase + " notificationId=" + id + " matched=" + matched + " details=" + details);
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

  private static PendingIntent acceptActivityIntent(Context context, NativeVideoCallRuntime.Session session) {
    Intent intent = new Intent(context, NativeVideoCallActivity.class);
    intent.setAction(NativeVideoCallActivity.ACTION_NOTIFICATION_ACCEPT);
    intent.putExtra(NativeVideoCallActivity.EXTRA_NOTIFICATION_ACCEPT, true);
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    putSessionExtras(intent, session);
    return PendingIntent.getActivity(
        context,
        requestCode(session.callId, 2),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static PendingIntent declineIntent(Context context, NativeVideoCallRuntime.Session session) {
    Intent intent = new Intent(context, NativeVideoCallActionReceiver.class);
    intent.setAction(NativeVideoCallActionReceiver.ACTION_REJECT);
    putSessionExtras(intent, session);
    return PendingIntent.getBroadcast(
        context,
        requestCode(session.callId, NativeVideoCallActionReceiver.ACTION_REJECT.hashCode()),
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
