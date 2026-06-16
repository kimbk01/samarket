package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.dibay.app.call.CallForegroundService;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * FCM 수신 — data-only 페이로드 → 채팅 알림(제목·본문) + 수신 통화(Full Screen).
 * notification 블록 없이 data-only 로 보내야 background/killed 에서도 onMessageReceived 가 호출된다.
 */
public class DibayFirebaseMessagingService extends FirebaseMessagingService {
  private static final String TAG = "DIBAY_FCM";
  /** Chat messages only — incoming/missed calls use separate channels. */
  static final String MESSAGES_CHANNEL_ID = "dibay_chat_messages_v1";

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Map<String, String> data = message.getData();
    if (data == null || data.isEmpty()) {
      RemoteMessage.Notification n = message.getNotification();
      if (n != null) {
        showMessageNotification(n.getTitle(), n.getBody(), null, null, null, null);
      }
      return;
    }

    Log.i(TAG, "[fcm] message_received");
    String type = FcmPayloadResolver.resolveType(data);
    Log.i(TAG, "[fcm] data_type_detected type=" + type);
    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();

    String title = firstNonEmpty(data.get("title"));
    String body = firstNonEmpty(data.get("body"));
    if (title == null && message.getNotification() != null) {
      title = message.getNotification().getTitle();
    }
    if (body == null && message.getNotification() != null) {
      body = message.getNotification().getBody();
    }

    if (IncomingCallTerminalHandler.isTerminalPushType(type)
        || IncomingCallTerminalHandler.isTerminalPushType(data.get("call_push_kind"))) {
      String callId = FcmPayloadResolver.resolveCallId(data);
      if (callId != null) {
        String kind = IncomingCallTerminalHandler.normalizeTerminalKind(type);
        IncomingCallTerminalHandler.handle(this, callId, kind, "fcm:" + type);
      }
      if ("missed_call".equals(type)) {
        handleMissedCallNotificationOnly(data, title, body, appVisible);
      }
      return;
    }

    if ("incoming_call".equals(type)) {
      handleIncomingCall(message, data, title, body, appVisible);
      return;
    }

    if (FcmPayloadResolver.isStandardRouteType(type) || "unknown".equals(type)) {
      if (appVisible && FcmPayloadResolver.isStandardRouteType(type)) {
        Log.i(TAG, "[fcm] foreground_skip_system_notification type=" + type);
        return;
      }
      String routeUrl = FcmPayloadResolver.resolveRouteUrl(data);
      showMessageNotification(title, body, routeUrl, data.get("tag"), data.get("notificationId"), type);
      return;
    }

    Log.i(TAG, "[fcm] unknown_type_fallback type=" + type);
    if (appVisible) return;
    showMessageNotification(title, body, FcmPayloadResolver.resolveRouteUrl(data), data.get("tag"), data.get("notificationId"), type);
  }

  private void handleIncomingCall(
      RemoteMessage message, Map<String, String> data, String title, String body, boolean appVisible) {
    long receivedAtMs = System.currentTimeMillis();
    IncomingCallPayload payload = FcmPayloadResolver.resolveIncomingCallPayload(data, title, body);
    if (!payload.isValid()) {
      Log.w(TAG, "[call-push] payload_invalid reason=" + payload.invalidReason);
      return;
    }
    String callId = payload.callId;
    DibayCallPushLog.logIncomingReceived(this, message, data, payload, appVisible, receivedAtMs);
    DibayCallPushLog.logPriorityCheck(message, data, callId);

    DibayCallLog.once("push_received", callId, "roomId=" + payload.roomId);
    Log.i(TAG, "[call-push] incoming_call_received callId=" + callId + " roomId=" + payload.roomId);

    if (DibayCallConsumedStore.isConsumed(this, callId)) {
      Log.i(TAG, "[DIBAY_CALL] incoming_ignored_consumed callId=" + callId);
      IncomingCallNotificationBuilder.dismissIncomingCall(this, callId);
      return;
    }

    DibayCallPushLog.ExpiryDecision expiry =
        DibayCallPushLog.resolveIncomingExpiry(this, data, payload, receivedAtMs);
    IncomingCallPushAckHelper.sendAsync(this, payload, expiry, receivedAtMs);
    if (expiry.expired) {
      DibayCallPushLog.info(
          "incoming_expired_ignored_server_terminal",
          callId,
          "serverExpiresAt="
              + expiry.serverExpiresAtMs
              + " effectiveExpiresAt="
              + expiry.effectiveExpiresAtMs
              + " receivedAt="
              + receivedAtMs);
      IncomingCallNotificationBuilder.dismissIncomingCall(this, callId);
      return;
    }
    if (expiry.effectiveExpiresAtMs > 0L) {
      payload = payload.withExpiresAt(formatIsoUtc(expiry.effectiveExpiresAtMs));
    }

    String pendingRoute =
        "/community-messenger/calls/" + Uri.encode(callId) + "?source=native_push";
    DibayIncomingCallNativeStore.setRinging(this, payload, pendingRoute, expiry.effectiveExpiresAtMs);
    MainActivity.persistCallPendingRoute(this, pendingRoute, payload, expiry.effectiveExpiresAtMs);

    if (DibayKeyguardHelper.isForegroundUnlockedInteractive(appVisible, this)) {
      Log.i(TAG, "[call-native] incoming_call_foreground_native_ui callId=" + callId);
      MainActivity.deliverCallIncomingEvent(payload);
      IncomingCallForegroundUiLauncher.showUi(this, payload);
      IncomingCallActionCoordinator.scheduleMissedTimeout(this, payload);
      return;
    }

    Log.i(
        TAG,
        "incoming_call_native_notification"
            + " callId="
            + callId
            + " keyguardLocked="
            + DibayKeyguardHelper.isKeyguardLocked(this)
            + " appVisible="
            + appVisible);

    startNativeRinging(callId);
    startRingingForegroundService(payload);
    IncomingCallNotificationBuilder.showIncomingCall(this, payload);
    IncomingCallActionCoordinator.scheduleMissedTimeout(this, payload);

    boolean keyguardLocked = DibayKeyguardHelper.isKeyguardLocked(this);
    boolean interactive = DibayKeyguardHelper.isInteractive(this);
    boolean lockBridge = keyguardLocked || !interactive;
    boolean fsiAllowed = IncomingCallNotificationBuilder.canPostFullScreenIntent(this);
    // 잠금·슬립에서는 FSI를 단일 진입점으로 두고, 권한이 막힌 경우에만 직접 Activity로 보강한다.
    if (lockBridge && !fsiAllowed) {
      Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(this, payload);
      if (incomingUi != null) {
        incomingUi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(incomingUi);
        Log.i(
            TAG,
            "[call-ui] incoming_activity_lock_launch callId="
                + callId
                + " keyguardLocked="
                + keyguardLocked
                + " interactive="
                + interactive
                + " fsiAllowed="
                + fsiAllowed);
      }
    }
  }

  private void startNativeRinging(String callId) {
    String active = IncomingCallRingOwner.getActiveCallId();
    if (callId != null && callId.equals(active)) {
      DibayCallPushLog.info("ringtone_skip_existing_owner", callId, "source=fcm");
      return;
    }
    boolean started = IncomingCallRingOwner.start(this, callId);
    if (started) {
      DibayCallPushLog.info("ringtone_start_native", callId, "source=fcm");
    } else {
      DibayCallPushLog.info("ringtone_skip_existing_owner", callId, "source=fcm_start_rejected");
    }
  }

  private void startRingingForegroundService(IncomingCallPayload payload) {
    if (payload == null || !payload.isValid()) return;
    try {
      CallForegroundService.startRinging(this, payload.callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          payload.callId,
          "ok=false err=" + error.getClass().getSimpleName());
    }
  }

  private static String formatIsoUtc(long millis) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      return java.time.Instant.ofEpochMilli(millis).toString();
    }
    SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
    iso.setTimeZone(TimeZone.getTimeZone("UTC"));
    return iso.format(new Date(millis));
  }

  private void handleMissedCallNotificationOnly(
      Map<String, String> data, String title, String body, boolean appVisible) {
    if (appVisible) {
      Log.i(TAG, "[fcm] foreground_skip_system_notification type=missed_call");
      return;
    }
    String callId = FcmPayloadResolver.resolveCallId(data);
    String routeUrl = FcmPayloadResolver.resolveRouteUrl(data);
    String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
    MissedCallNotificationHelper.show(this, title, body, routeUrl, callId, roomId, data.get("tag"));
  }

  @Override
  public void onNewToken(String token) {
    Log.i(TAG, "[fcm] token_refresh length=" + (token != null ? token.length() : 0));
  }

  private static String firstNonEmpty(String... values) {
    if (values == null) return null;
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }

  static void ensureMessagesChannelStatic(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(MESSAGES_CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(MESSAGES_CHANNEL_ID, "채팅 메시지", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("채팅 메시지 알림");
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(channel);
  }

  private void ensureMessagesChannel() {
    ensureMessagesChannelStatic(this);
  }

  private void showMessageNotification(
      String title, String body, String url, String tag, String notificationId, String type) {
    ensureMessagesChannel();
    Intent launch = new Intent(this, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (url != null && !url.isEmpty()) {
      if (url.startsWith("/")) {
        launch.putExtra("url", url);
      } else {
        launch.setData(Uri.parse(url));
      }
    } else {
      launch.setAction(Intent.ACTION_MAIN);
    }
    if (type != null) launch.putExtra("type", type);
    if (notificationId != null) launch.putExtra("notificationId", notificationId);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    int requestCode = tag != null ? tag.hashCode() : (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
    PendingIntent pi = PendingIntent.getActivity(this, requestCode, launch, flags);

    String safeTitle = title != null && !title.isEmpty() ? title : "DIBAY";
    String safeBody = body != null ? body : "";

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, MESSAGES_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(Notification.DEFAULT_ALL);

    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify(requestCode, builder.build());
      Log.i(TAG, "message_notification title=" + safeTitle);
    }
  }
}
