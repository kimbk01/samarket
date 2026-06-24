package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Messenger-style incoming call notification — system call category with accept/decline actions.
 *
 * <p>Foreground unlocked uses Web CallV4IncomingSheet (owner web_in_app). Lock/screen-off uses
 * notification actions plus optional full-screen intent bridge ({@link IncomingCallActivity}).
 */
public final class IncomingCallNotificationBuilder {
  /** Silent channel — ring is {@link IncomingCallRingOwner} only; channel sound caused double ring. */
  public static final String CHANNEL_ID = "dibay_calls_incoming_v7";
  /** Spec alias — same channel as {@link #CHANNEL_ID}. */
  public static final String CHANNEL_ID_ALIAS = "dibay_incoming_calls";
  public static final int INCOMING_CALL_NOTIFICATION_BASE_ID = 91001;
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  /** One full-screen intent attach per callId per incoming presentation wave. */
  private static final ConcurrentHashMap<String, Boolean> FSI_ATTACHED_BY_CALL_ID =
      new ConcurrentHashMap<>();

  private IncomingCallNotificationBuilder() {}

  static void clearFsiAttachGate(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    FSI_ATTACHED_BY_CALL_ID.remove(callId.trim());
  }

  public static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
    if (existing != null) {
      DibayCallPushLog.info(
          "notification_channel_checked", null, "channelId=" + CHANNEL_ID + " importance=" + existing.getImportance());
      return;
    }
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "수신 통화", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("수신 통화 — UI only (ring via RingOwner, alias " + CHANNEL_ID_ALIAS + ")");
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setSound(null, null);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      channel.setBypassDnd(true);
    }
    nm.createNotificationChannel(channel);
    DibayCallPushLog.info(
        "notification_channel_created", null, "channelId=" + CHANNEL_ID + " importance=HIGH sound=disabled");
  }

  public static boolean canPostNotifications(Context context) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED;
  }

  public static int incomingChannelImportance(Context context) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return NotificationManager.IMPORTANCE_DEFAULT;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    NotificationChannel channel = nm != null ? nm.getNotificationChannel(CHANNEL_ID) : null;
    return channel != null ? channel.getImportance() : NotificationManager.IMPORTANCE_UNSPECIFIED;
  }

  public static boolean isIncomingChannelBlocked(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
    return incomingChannelImportance(context) == NotificationManager.IMPORTANCE_NONE;
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

  public static void showIncomingCall(
      Context context,
      String sessionId,
      String title,
      String body,
      String deepLinkUrl,
      String callType,
      String expiresAt) {
    showIncomingCallInternal(
        context, sessionId, title, body, deepLinkUrl, callType, expiresAt, null, null, null, null, false, false);
  }

  public static void showIncomingCall(Context context, IncomingCallPayload payload) {
    showIncomingCall(context, payload, false);
  }

  public static void showIncomingCall(Context context, IncomingCallPayload payload, boolean fgsDelivery) {
    if (payload == null || !payload.isValid()) return;
    showIncomingCallInternal(
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
        payload.callerAvatarUrl,
        fgsDelivery,
        false);
  }

  /**
   * V4 non-foreground — accept/decline action carrier only (no CallStyle heads-up, no FSI).
   * Used when {@link IncomingCallActivity} is the primary visible incoming surface.
   */
  public static void showIncomingCallActionOnly(
      Context context, IncomingCallPayload payload, boolean fgsDelivery) {
    if (payload == null || !payload.isValid()) return;
    String sid = payload.callId.trim();
    Log.i(
        com.dibay.app.callv4.CallV4Lane.TAG,
        "[DIBAY_CALL_V4] incoming_notification_action_only callId=" + sid);
    showIncomingCallInternal(
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
        payload.callerAvatarUrl,
        fgsDelivery,
        true);
  }

  private static void showIncomingCallInternal(
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
      String callerAvatarUrl,
      boolean fgsDelivery,
      boolean actionOnly) {
    ensureChannel(context);
    if (sessionId == null || sessionId.trim().isEmpty()) return;
    String sid = sessionId.trim();
    if (!fgsDelivery && !actionOnly && !IncomingCallActionCoordinator.registerIncoming(context, sid)) {
      Log.w(TAG, "[call-notification] incoming_ui_duplicate_blocked callId=" + sid);
      return;
    }
    boolean firstIncoming = true;

    ChannelDiagnostics diagnostics = inspectChannel(context, sid);
    boolean notificationAllowed = diagnostics.notificationAllowed;
    if (!notificationAllowed) {
      Log.w(TAG, "[call-push] post_notifications_denied callId=" + sid);
      DibayCallPushLog.warn("notification_permission_denied", sid, diagnostics.toLogString());
    }
    if (diagnostics.channelBlocked) {
      DibayCallPushLog.warn("notification_channel_blocked", sid, diagnostics.toLogString());
    }
    boolean lockScreenBridge =
        DibayKeyguardHelper.isKeyguardLocked(context) || !DibayKeyguardHelper.isInteractive(context);
    boolean fsiAllowed = canPostFullScreenIntent(context);
    DibayCallPushLog.info(
        fsiAllowed ? "full_screen_intent_allowed" : "full_screen_intent_blocked",
        sid,
        "lockScreenBridge=" + lockScreenBridge + " fgsDelivery=" + fgsDelivery + " actionOnly=" + actionOnly);
    Log.i(
        TAG,
        "[call-push] lock_bridge="
            + lockScreenBridge
            + " fsiAllowed="
            + fsiAllowed
            + " fgsDelivery="
            + fgsDelivery
            + " actionOnly="
            + actionOnly
            + " callId="
            + sid);

    final Context app = context.getApplicationContext();
    final int notificationId = INCOMING_CALL_NOTIFICATION_BASE_ID + Math.abs(sid.hashCode() % 1000);

    if (actionOnly) {
      Notification actionOnlyNotification =
          buildActionOnlyIncomingNotification(
              app, sid, title, body, callType, expiresAt, roomId, callerId, callerNameFromPayload, callerAvatarUrl);
      boolean posted =
          postNotificationWithFallback(
              app,
              notificationId,
              sid,
              actionOnlyNotification,
              diagnostics,
              () -> actionOnlyNotification);
      if (!posted && !fgsDelivery) {
        launchActivityFallback(
            app, sid, roomId, callerId, callerNameFromPayload, callerAvatarUrl, callType, expiresAt, title, body);
      }
      return;
    }

    FSI_ATTACHED_BY_CALL_ID.remove(sid);
    Notification callStyle =
        buildIncomingNotification(
            app,
            sid,
            title,
            body,
            callType,
            expiresAt,
            roomId,
            callerId,
            callerNameFromPayload,
            callerAvatarUrl,
            null,
            null,
            lockScreenBridge,
            fsiAllowed,
            firstIncoming,
            fgsDelivery,
            true,
            false);

    boolean posted =
        postNotificationWithFallback(
            app,
            notificationId,
            sid,
            callStyle,
            diagnostics,
            () ->
                buildIncomingNotification(
                    app,
                    sid,
                    title,
                    body,
                    callType,
                    expiresAt,
                    roomId,
                    callerId,
                    callerNameFromPayload,
                    callerAvatarUrl,
                    null,
                    null,
                    lockScreenBridge,
                    fsiAllowed,
                    firstIncoming,
                    fgsDelivery,
                    false,
                    false));
    if (!posted && !fgsDelivery) {
      launchActivityFallback(app, sid, roomId, callerId, callerNameFromPayload, callerAvatarUrl, callType, expiresAt, title, body);
    }

    String avatarUrl = callerAvatarUrl != null ? callerAvatarUrl.trim() : "";
    if (avatarUrl.isEmpty()) return;

    new Thread(
            () -> {
              IconCompat callerIcon = IncomingCallAvatarHelper.loadIconCompat(callerAvatarUrl);
              Bitmap callerBitmap = IncomingCallAvatarHelper.loadBitmapBlocking(callerAvatarUrl);
              if (callerIcon == null && callerBitmap == null) return;
              Notification enriched =
                  buildIncomingNotification(
                      app,
                      sid,
                      title,
                      body,
                      callType,
                      expiresAt,
                      roomId,
                      callerId,
                      callerNameFromPayload,
                      callerAvatarUrl,
                      callerIcon,
                      callerBitmap,
                      lockScreenBridge,
                      fsiAllowed,
                      firstIncoming,
                      fgsDelivery,
                      true,
                      false);
              MAIN.post(
                  () -> {
                    NotificationManager enrichNm =
                        (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (enrichNm != null) {
                      try {
                        enrichNm.notify(notificationId, enriched);
                        Log.i(TAG, "[call-notification] incoming_avatar_enriched callId=" + sid);
                      } catch (Exception error) {
                        DibayCallPushLog.warn(
                            "incoming_notification_enrich_failed",
                            sid,
                            "err=" + error.getClass().getSimpleName());
                      }
                    }
                  });
            })
        .start();
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
    showIncomingCallInternal(
        context,
        sessionId,
        title,
        body,
        deepLinkUrl,
        callType,
        expiresAt,
        roomId,
        callerId,
        callerNameFromPayload,
        callerAvatarUrl,
        false,
        false);
  }

  private static Notification buildActionOnlyIncomingNotification(
      Context context,
      String sid,
      String title,
      String body,
      String callType,
      String expiresAt,
      String roomId,
      String callerId,
      String callerNameFromPayload,
      String callerAvatarUrl) {
    return buildIncomingNotification(
        context,
        sid,
        title,
        body,
        callType,
        expiresAt,
        roomId,
        callerId,
        callerNameFromPayload,
        callerAvatarUrl,
        null,
        null,
        false,
        false,
        true,
        false,
        false,
        true);
  }

  private interface NotificationSupplier {
    Notification get();
  }

  private static boolean postNotificationWithFallback(
      Context app,
      int notificationId,
      String sid,
      Notification primary,
      ChannelDiagnostics diagnostics,
      NotificationSupplier legacySupplier) {
    NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) {
      DibayCallPushLog.warn("incoming_notification_post_failed", sid, "notificationManager=null");
      return false;
    }
    try {
      nm.notify(notificationId, primary);
      DibayCallLog.once("notification_created", sid, "source=notification style=callstyle");
      DibayCallPushLog.info("incoming_notification_posted", sid, diagnostics.toLogString() + " style=callstyle");
      Log.i(TAG, "[call-notification] incoming_posted_immediate callId=" + sid + " style=callstyle");
      return true;
    } catch (Exception primaryError) {
      DibayCallPushLog.warn(
          "incoming_notification_post_failed",
          sid,
          diagnostics.toLogString()
              + " err="
              + primaryError.getClass().getSimpleName()
              + " retry=legacy_silent");
    }
    try {
      Notification legacy = legacySupplier != null ? legacySupplier.get() : null;
      if (legacy == null) return false;
      nm.notify(notificationId, legacy);
      DibayCallLog.once("notification_created", sid, "source=notification style=legacy_silent");
      DibayCallPushLog.info("incoming_notification_posted", sid, diagnostics.toLogString() + " style=legacy_silent");
      Log.i(TAG, "[call-notification] incoming_posted_immediate callId=" + sid + " style=legacy_silent");
      return true;
    } catch (Exception legacyError) {
      DibayCallPushLog.warn(
          "incoming_notification_post_failed",
          sid,
          diagnostics.toLogString() + " err=" + legacyError.getClass().getSimpleName() + " retry=exhausted");
      return false;
    }
  }

  private static Notification buildIncomingNotification(
      Context context,
      String sid,
      String title,
      String body,
      String callType,
      String expiresAt,
      String roomId,
      String callerId,
      String callerNameFromPayload,
      String callerAvatarUrl,
      IconCompat callerIcon,
      Bitmap callerBitmap,
      boolean lockScreenBridge,
      boolean fsiAllowed,
      boolean firstIncoming,
      boolean fgsDelivery,
      boolean useCallStyle,
      boolean actionOnly) {
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

    int acceptRequestCode = sid.hashCode() + 2;
    Intent accept = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, fsiPayload);
    if (accept != null) {
      accept.setAction(IncomingCallActivity.ACTION_ACCEPT);
    } else {
      accept = new Intent(context, IncomingCallActivity.class);
      accept.setAction(IncomingCallActivity.ACTION_ACCEPT);
      accept.putExtra(IncomingCallActivity.EXTRA_CALL_ID, sid);
      accept.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }
    PendingIntent acceptPi = null;
    try {
      acceptPi = PendingIntent.getActivity(context, acceptRequestCode, accept, flags);
    } catch (Exception error) {
      Log.w(
          TAG,
          "[call-notification] fallback_accept_pi_failed callId="
              + sid
              + " action="
              + accept.getAction()
              + " target="
              + (accept.getComponent() != null ? accept.getComponent().getClassName() : "null")
              + " requestCode="
              + acceptRequestCode
              + " err="
              + error.getClass().getSimpleName());
    }
    Log.i(
        TAG,
        "[call-notification] fallback_accept_pi_created callId="
            + sid
            + " action="
            + accept.getAction()
            + " target="
            + (accept.getComponent() != null ? accept.getComponent().getClassName() : "null")
            + " requestCode="
            + acceptRequestCode
            + " acceptPiNull="
            + (acceptPi == null));
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
            .setPriority(
                actionOnly ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPi)
            .setDefaults(Notification.DEFAULT_VIBRATE);

    if (callerBitmap != null) {
      builder.setLargeIcon(callerBitmap);
    }

    boolean attachFsi =
        !actionOnly
            && firstIncoming
            && fsiAllowed
            && fullScreenPi != null
            && (lockScreenBridge || fgsDelivery);

    boolean applyCallStyle = useCallStyle && !actionOnly;

    if (applyCallStyle && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Person.Builder personBuilder = new Person.Builder().setName(callerName).setImportant(true);
      if (callerIcon != null) {
        personBuilder.setIcon(callerIcon);
      }
      Person caller = personBuilder.build();
      try {
        builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, acceptPi));
      } catch (IllegalArgumentException | IllegalStateException error) {
        DibayCallPushLog.warn(
            "callstyle_build_failed",
            sid,
            "err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
        applyCallStyle = false;
      }
    }
    if (!applyCallStyle || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      builder
          .setColor(ContextCompat.getColor(context, R.color.dibay_incoming_primary))
          .setColorized(true)
          .setStyle(new NotificationCompat.BigTextStyle().bigText(callKindLabel))
          .addAction(new NotificationCompat.Action.Builder(0, rejectLabel, declinePi).build())
          .addAction(new NotificationCompat.Action.Builder(0, acceptLabel, acceptPi).build());
    }
    if (attachFsi) {
      if (FSI_ATTACHED_BY_CALL_ID.putIfAbsent(sid, Boolean.TRUE) != null) {
        builder.setFullScreenIntent(null, false);
        DibayCallPushLog.info(
            "full_screen_intent_skipped_duplicate",
            sid,
            "api=" + (applyCallStyle ? "call_style" : "legacy") + " fgsDelivery=" + fgsDelivery);
        Log.i(
            TAG,
            "[call-notification] fsi_attach_skipped_duplicate callId="
                + sid
                + " style="
                + (applyCallStyle ? "callstyle" : "legacy"));
      } else {
        builder.setFullScreenIntent(fullScreenPi, true);
        DibayCallPushLog.info(
            "full_screen_intent_attached",
            sid,
            "api=" + (applyCallStyle ? "call_style" : "legacy") + " fgsDelivery=" + fgsDelivery);
        Log.i(
            TAG,
            "[call-notification] fsi_attached callId="
                + sid
                + " fgsDelivery="
                + fgsDelivery
                + " style="
                + (applyCallStyle ? "callstyle" : "legacy"));
      }
    } else {
      builder.setFullScreenIntent(null, false);
      if (lockScreenBridge && !fsiAllowed) {
        Log.w(TAG, "[call-notification] fsi_skipped_denied callId=" + sid);
      }
    }

    return builder.build();
  }

  public static void dismissIncomingCall(Context context, String sessionId) {
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || sessionId == null) return;
    String sid = sessionId.trim();
    if (sid.isEmpty()) return;
    nm.cancel(INCOMING_CALL_NOTIFICATION_BASE_ID + Math.abs(sid.hashCode() % 1000));
    clearFsiAttachGate(sid);
    IncomingCallSurfaceOwner.clear(sid);
    DibayCallLog.once("notification_cancel", sid);
  }

  public static void clearActiveIncomingCallId(String sessionId) {
    /* no-op — activeIncomingCallId gate removed */
  }

  private static ChannelDiagnostics inspectChannel(Context context, String callId) {
    ensureChannel(context);
    boolean notificationAllowed = canPostNotifications(context);
    int importance = incomingChannelImportance(context);
    boolean channelBlocked = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && importance == NotificationManager.IMPORTANCE_NONE;
    DibayCallPushLog.info(
        "notification_channel_checked",
        callId,
        "channelId=" + CHANNEL_ID + " importance=" + importance + " notificationsAllowed=" + notificationAllowed);
    return new ChannelDiagnostics(notificationAllowed, channelBlocked, importance);
  }

  private static void launchActivityFallback(
      Context context,
      String sid,
      String roomId,
      String callerId,
      String callerName,
      String callerAvatarUrl,
      String callType,
      String expiresAt,
      String title,
      String body) {
    DibayCallPushLog.info("incoming_activity_fallback_attempt", sid, "reason=notification_unavailable");
    try {
      IncomingCallPayload payload =
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
      Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, payload);
      if (incomingUi == null) {
        DibayCallPushLog.warn("incoming_activity_fallback_blocked", sid, "reason=invalid_intent");
        return;
      }
      incomingUi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(incomingUi);
      DibayCallPushLog.info("incoming_activity_fallback_success", sid, "reason=notification_unavailable");
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "incoming_activity_fallback_blocked", sid, "err=" + error.getClass().getSimpleName());
    }
  }

  private static final class ChannelDiagnostics {
    final boolean notificationAllowed;
    final boolean channelBlocked;
    final int importance;

    ChannelDiagnostics(boolean notificationAllowed, boolean channelBlocked, int importance) {
      this.notificationAllowed = notificationAllowed;
      this.channelBlocked = channelBlocked;
      this.importance = importance;
    }

    String toLogString() {
      return "notificationsAllowed="
          + notificationAllowed
          + " channelBlocked="
          + channelBlocked
          + " channelImportance="
          + importance;
    }
  }
}
