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

/**
 * Messenger-style incoming call notification — silent carrier; ringtone is {@link IncomingCallRingOwner} only.
 *
 * <p>Foreground unlocked: Web {@code IncomingCallBanner} (no notification). Lock+FSI: {@link
 * IncomingCallActivity}. Fallback: {@link NotificationCompat.CallStyle}.
 */
public final class IncomingCallNotificationBuilder {
  /** Silent channel — versioned because OS channel sound/importance is sticky per id. */
  public static final String CHANNEL_ID = "dibay_calls_incoming_v5";
  /** Spec alias — same channel as {@link #CHANNEL_ID}. */
  public static final String CHANNEL_ID_ALIAS = "dibay_incoming_calls";
  public static final int INCOMING_CALL_NOTIFICATION_BASE_ID = 91001;
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  private IncomingCallNotificationBuilder() {}

  public static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
    if (existing != null) {
      DibayCallPushLog.info(
          "notification_channel_checked", null, "channelId=" + CHANNEL_ID + " importance=" + existing.getImportance());
      logRingOwnerDecision(null, false, "channel_exists");
      return;
    }
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "수신 통화", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("수신 음성·영상 통화 — silent (ring via RingOwner, alias " + CHANNEL_ID_ALIAS + ")");
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setSound(null, null);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      channel.setAllowBubbles(false);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      channel.setBypassDnd(true);
    }
    nm.createNotificationChannel(channel);
    DibayCallPushLog.info(
        "notification_channel_created", null, "channelId=" + CHANNEL_ID + " importance=IMPORTANCE_HIGH sound=disabled");
    logRingOwnerDecision(null, false, "channel_created_silent");
  }

  public static void logRingOwnerDecision(String callId, boolean ringOwnerStart, String reason) {
    Log.i(
        "DIBAY_CALL",
        "[DIBAY_CALL] ring_owner_decision"
            + " callId="
            + (callId != null ? callId : "")
            + " ringOwnerStart="
            + ringOwnerStart
            + " notificationSound=disabled"
            + " channelId="
            + CHANNEL_ID
            + " reason="
            + reason);
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
      intent.setData(android.net.Uri.fromParts("package", context.getPackageName(), null));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
    } catch (Exception error) {
      Log.w(TAG, "[incoming-call-native] fsi_settings_open_failed " + error.getMessage());
    }
  }

  public static void refreshIncomingCallIfPresent(
      Context context, IncomingCallPayload payload, IncomingCallRouteDecision decision) {
    if (payload == null || !payload.isValid() || decision == null) return;
    String sid = payload.callId.trim();
    if (!IncomingCallSessionMachine.isActiveRingingCall(sid)) return;
    showIncomingCall(
        context,
        sid,
        payload.title,
        payload.body,
        null,
        payload.callType,
        payload.expiresAt,
        payload.roomId,
        payload.callerId,
        payload.callerName,
        payload.callerAvatarUrl,
        decision,
        true);
  }

  public static void showIncomingCall(
      Context context, String sessionId, String title, String body, String deepLinkUrl) {
    showIncomingCall(context, sessionId, title, body, deepLinkUrl, null, null);
  }

  public static void showIncomingCall(Context context, IncomingCallPayload payload) {
    if (payload == null || !payload.isValid()) return;
    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
    IncomingCallRouteDecision decision =
        IncomingCallRouteDecision.resolve(context, appVisible, payload.callId);
    showIncomingCall(context, payload, decision);
  }

  public static void showIncomingCall(
      Context context, IncomingCallPayload payload, IncomingCallRouteDecision decision) {
    if (payload == null || !payload.isValid() || decision == null) return;
    if (decision.selectedSurface == IncomingCallRouteDecision.SelectedSurface.FOREGROUND_BANNER) {
      Log.w(TAG, "[call-notification] incoming_skipped_foreground_banner callId=" + payload.callId);
      return;
    }
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
        payload.callerAvatarUrl,
        decision);
  }

  public static void showIncomingCall(
      Context context,
      String sessionId,
      String title,
      String body,
      String deepLinkUrl,
      String callType,
      String expiresAt) {
    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
    IncomingCallRouteDecision decision = IncomingCallRouteDecision.resolve(context, appVisible, sessionId);
    showIncomingCall(
        context, sessionId, title, body, deepLinkUrl, callType, expiresAt, null, null, null, null, decision);
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
      String callerAvatarUrl,
      IncomingCallRouteDecision decision) {
    showIncomingCall(
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
        decision,
        false);
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
      String callerAvatarUrl,
      IncomingCallRouteDecision decision,
      boolean duplicateRefresh) {
    ensureChannel(context);
    if (sessionId == null || sessionId.trim().isEmpty() || decision == null) return;
    String sid = sessionId.trim();
    if (!duplicateRefresh && !IncomingCallSessionMachine.canRepresentIncomingUi(sid)) {
      Log.w(TAG, "[call-notification] incoming_ui_blocked_phase callId=" + sid);
      return;
    }
    boolean firstIncoming =
        duplicateRefresh
            ? IncomingCallSessionMachine.isActiveRingingCall(sid)
            : IncomingCallActionCoordinator.registerIncoming(context, sid);
    if (!firstIncoming) {
      return;
    }

    ChannelDiagnostics diagnostics = inspectChannel(context, sid);
    boolean notificationAllowed = diagnostics.notificationAllowed;
    if (!notificationAllowed) {
      Log.w(TAG, "[call-push] post_notifications_denied callId=" + sid);
      DibayCallPushLog.warn("notification_permission_denied", sid, diagnostics.toLogString());
    }
    if (diagnostics.channelBlocked) {
      DibayCallPushLog.warn("notification_channel_blocked", sid, diagnostics.toLogString());
    }

    logRingOwnerDecision(sid, false, "notification_post_silent");
    logIncomingUiSurface(sid, decision, false);

    final Context app = context.getApplicationContext();
    final int notificationId = INCOMING_CALL_NOTIFICATION_BASE_ID + Math.abs(sid.hashCode() % 1000);

    Notification immediate =
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
            decision,
            firstIncoming);
    NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
    boolean posted = false;
    if (nm != null) {
      try {
        nm.notify(notificationId, immediate);
        posted = true;
        DibayCallLog.once("notification_created", sid, "source=notification surface=" + decision.selectedSurfaceName());
        DibayCallPushLog.info(
            "incoming_notification_posted",
            sid,
            diagnostics.toLogString() + " surface=" + decision.selectedSurfaceName() + " sound=disabled");
        Log.i(
            TAG,
            "[call-notification] incoming_posted_immediate callId="
                + sid
                + " first="
                + firstIncoming
                + " surface="
                + decision.selectedSurfaceName());
      } catch (Exception error) {
        DibayCallPushLog.warn(
            "incoming_notification_post_failed",
            sid,
            diagnostics.toLogString() + " err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
      }
    } else {
      DibayCallPushLog.warn("incoming_notification_post_failed", sid, "notificationManager=null");
    }
    if (!posted || !notificationAllowed || diagnostics.channelBlocked) {
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
                      decision,
                      firstIncoming);
              MAIN.post(
                  () -> {
                    NotificationManager enrichNm =
                        (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (enrichNm != null) {
                      enrichNm.notify(notificationId, enriched);
                      Log.i(TAG, "[call-notification] incoming_avatar_enriched callId=" + sid);
                    }
                  });
            })
        .start();
  }

  private static void logIncomingUiSurface(String callId, IncomingCallRouteDecision decision, boolean fallbackLaunch) {
    boolean duplicateSuppressed =
        decision.selectedSurface == IncomingCallRouteDecision.SelectedSurface.INCOMING_ACTIVITY;
    Log.i(
        "DIBAY_CALL",
        "[DIBAY_CALL] incoming_ui_surface"
            + " callId="
            + callId
            + " surface="
            + decision.selectedSurfaceName()
            + " fallback="
            + fallbackLaunch
            + " duplicateSuppressed="
            + duplicateSuppressed);
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
      IncomingCallRouteDecision decision,
      boolean firstIncoming) {
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

    boolean useFsiPrimary =
        decision.selectedSurface == IncomingCallRouteDecision.SelectedSurface.INCOMING_ACTIVITY
            && firstIncoming
            && decision.fsiAllowed
            && fullScreenPi != null;
    boolean useCallStylePrimary =
        decision.selectedSurface == IncomingCallRouteDecision.SelectedSurface.CALLSTYLE_FALLBACK;

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(callerName)
            .setContentText(callKindLabel)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPi)
            .setDefaults(Notification.DEFAULT_VIBRATE)
            .setSilent(true);

    if (!useCallStylePrimary) {
      builder.setOnlyAlertOnce(true);
      builder
          .setColor(ContextCompat.getColor(context, R.color.dibay_incoming_primary))
          .setColorized(true);
    }

    if (callerBitmap != null) {
      builder.setLargeIcon(callerBitmap);
    }

    if (useFsiPrimary) {
      builder
          .setStyle(new NotificationCompat.BigTextStyle().bigText(callKindLabel))
          .addAction(new NotificationCompat.Action.Builder(0, rejectLabel, declinePi).build())
          .setFullScreenIntent(fullScreenPi, true);
      DibayCallPushLog.info("full_screen_intent_attached", sid, "api=fsi_primary callstyle_suppressed=true");
      Log.i(TAG, "[call-notification] fsi_attached callId=" + sid + " callstyle_suppressed=true");
    } else if (useCallStylePrimary && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Person.Builder personBuilder = new Person.Builder().setName(callerName).setImportant(true);
      if (callerIcon != null) {
        personBuilder.setIcon(callerIcon);
      }
      Person caller = personBuilder.build();
      try {
        builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, acceptPi));
        if (decision.fsiAllowed && fullScreenPi != null) {
          builder.setFullScreenIntent(fullScreenPi, true);
          DibayCallPushLog.info("callstyle_attached", sid, "api=callstyle_fallback fsi=true");
          Log.i(TAG, "[call-notification] callstyle_attached callId=" + sid + " fsi=true");
        } else {
          builder.setFullScreenIntent(null, false);
          DibayCallPushLog.info("callstyle_attached", sid, "api=callstyle_fallback fsi=false");
          Log.i(TAG, "[call-notification] callstyle_attached callId=" + sid);
        }
      } catch (IllegalArgumentException | IllegalStateException error) {
        DibayCallPushLog.warn(
            "callstyle_build_failed",
            sid,
            "err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage() + " fallback=legacy_actions");
        builder
            .setStyle(new NotificationCompat.BigTextStyle().bigText(callKindLabel))
            .addAction(new NotificationCompat.Action.Builder(0, rejectLabel, declinePi).build())
            .addAction(new NotificationCompat.Action.Builder(0, acceptLabel, acceptPi).build());
        if (decision.fsiAllowed && fullScreenPi != null) {
          builder.setFullScreenIntent(fullScreenPi, true);
        } else {
          builder.setFullScreenIntent(null, false);
        }
        Log.w(TAG, "[call-notification] callstyle_fallback_legacy callId=" + sid);
      }
    } else if (useCallStylePrimary) {
      builder
          .setStyle(new NotificationCompat.BigTextStyle().bigText(callKindLabel))
          .addAction(new NotificationCompat.Action.Builder(0, rejectLabel, declinePi).build())
          .addAction(new NotificationCompat.Action.Builder(0, acceptLabel, acceptPi).build());
      builder.setFullScreenIntent(null, false);
      DibayCallPushLog.info("callstyle_attached", sid, "api=legacy_fallback fsi=false");
      Log.i(TAG, "[call-notification] callstyle_attached_legacy callId=" + sid);
    } else {
      builder
          .setStyle(new NotificationCompat.BigTextStyle().bigText(callKindLabel))
          .addAction(new NotificationCompat.Action.Builder(0, rejectLabel, declinePi).build());
      builder.setFullScreenIntent(null, false);
    }

    return builder.build();
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
      logIncomingUiSurface(sid, IncomingCallRouteDecision.resolve(context, false, sid), true);
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
