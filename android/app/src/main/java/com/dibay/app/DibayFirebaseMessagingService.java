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
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FCM 수신 — data-only 페이로드 → 채팅 알림(제목·본문) + 수신 통화(Full Screen).
 * notification 블록 없이 data-only 로 보내야 background/killed 에서도 onMessageReceived 가 호출된다.
 */
public class DibayFirebaseMessagingService extends FirebaseMessagingService {
  private static final String TAG = "DIBAY_FCM";
  /** v2 — 기존 `dibay_messages` 가 사용자/OS 에 의해 importance 가 낮아진 경우 마이그레이션 */
  static final String MESSAGES_CHANNEL_ID = "dibay_messages_v2";
  static final String LEGACY_MESSAGES_CHANNEL_ID = "dibay_messages";
  static final String ADMIN_ADS_CHANNEL_ID = "dibay_admin_ads_v1";
  private static final long EVENT_DEDUPE_MS = 10_000L;
  private static final ConcurrentHashMap<String, Long> recentNotificationEventIds =
      new ConcurrentHashMap<>();

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Map<String, String> data = message.getData();
    if (data == null || data.isEmpty()) {
      RemoteMessage.Notification n = message.getNotification();
      if (n != null) {
        showMessageNotification(n.getTitle(), n.getBody(), null, null, null, null, 0, null);
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

    if (FcmPayloadResolver.isAdminNotificationType(type)) {
      if (appVisible) {
        Log.i(TAG, "[fcm] foreground_skip_system_notification type=" + type);
        return;
      }
      String routeUrl = firstNonEmpty(data.get("routeUrl"), data.get("url"));
      String payloadTitle = firstNonEmpty(data.get("title"), title);
      String payloadBody = firstNonEmpty(data.get("body"), body);
      showAdminNotification(
          payloadTitle,
          payloadBody,
          routeUrl,
          data.get("tag"),
          firstNonEmpty(data.get("notificationEventId"), data.get("notificationId")),
          type,
          data);
      return;
    }

    if (FcmPayloadResolver.isStandardRouteType(type) || "unknown".equals(type)) {
      if (appVisible && FcmPayloadResolver.isStandardRouteType(type)) {
        Log.i(TAG, "[fcm] foreground_skip_system_notification type=" + type);
        return;
      }
      String routeUrl = firstNonEmpty(data.get("routeUrl"), resolveChatRouteUrl(data));
      String payloadTitle = firstNonEmpty(data.get("title"), title);
      String payloadBody = firstNonEmpty(data.get("body"), body);
      showMessageNotification(
          payloadTitle,
          payloadBody,
          routeUrl,
          data.get("tag"),
          firstNonEmpty(data.get("notificationEventId"), data.get("notificationId")),
          type,
          parseBadgeCount(data),
          data);
      return;
    }

    Log.i(TAG, "[fcm] unknown_type_fallback type=" + type);
    if (appVisible) return;
    String routeUrl = firstNonEmpty(data.get("routeUrl"), resolveChatRouteUrl(data));
    String payloadTitle = firstNonEmpty(data.get("title"), title);
    String payloadBody = firstNonEmpty(data.get("body"), body);
    showMessageNotification(
        payloadTitle,
        payloadBody,
        routeUrl,
        data.get("tag"),
        firstNonEmpty(data.get("notificationEventId"), data.get("notificationId")),
        type,
        parseBadgeCount(data),
        data);
  }

  private static int parseBadgeCount(Map<String, String> data) {
    if (data == null) return 0;
    try {
      return Math.max(0, Integer.parseInt(firstNonEmpty(data.get("badgeCount"), "0")));
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  private static String resolveChatRouteUrl(Map<String, String> data) {
    String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
    if (roomId != null) {
      return "dibay://chat/" + Uri.encode(roomId);
    }
    return FcmPayloadResolver.resolveRouteUrl(data);
  }

  private static boolean shouldSkipEventDedupe(String notificationEventId) {
    if (notificationEventId == null || notificationEventId.isEmpty()) return false;
    long now = System.currentTimeMillis();
    Long prev = recentNotificationEventIds.put(notificationEventId, now);
    if (prev != null && now - prev < EVENT_DEDUPE_MS) return true;
    return false;
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
    if (IncomingCallSessionStatusProbe.shouldProbe(expiry)) {
      String serverStatus = IncomingCallSessionStatusProbe.fetchStatus(this, callId);
      if (IncomingCallSessionStatusProbe.isTerminalStatus(serverStatus)) {
        DibayCallPushLog.info(
            "incoming_late_terminal_blocked",
            callId,
            "status=" + serverStatus + " deliveryDelayMs=" + expiry.deliveryDelayMs);
        IncomingCallTerminalHandler.handle(this, callId, serverStatus, "incoming_status_probe");
        return;
      }
    }
    if (expiry.effectiveExpiresAtMs > 0L) {
      payload = payload.withExpiresAt(formatIsoUtc(expiry.effectiveExpiresAtMs));
    }

    String pendingRoute =
        "/community-messenger/calls/" + Uri.encode(callId) + "?source=native_push";
    DibayIncomingCallNativeStore.setRinging(this, payload, pendingRoute, expiry.effectiveExpiresAtMs);
    MainActivity.persistCallPendingRoute(this, pendingRoute, payload, expiry.effectiveExpiresAtMs);

    IncomingCallPushDelivery.deliver(this, payload);
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

    try {
      nm.deleteNotificationChannel(LEGACY_MESSAGES_CHANNEL_ID);
    } catch (RuntimeException ignored) {
      // ignore
    }

    NotificationChannel existing = nm.getNotificationChannel(MESSAGES_CHANNEL_ID);
    // Samsung dumpsys can report lockscreenVisibility=-1000 while channel is PUBLIC — recreate on importance only.
    if (existing != null && existing.getImportance() < NotificationManager.IMPORTANCE_HIGH) {
      nm.deleteNotificationChannel(MESSAGES_CHANNEL_ID);
      existing = null;
      Log.i(TAG, "[notify-channel] messages_channel_recreate reason=degraded_importance");
    }

    if (existing == null) {
      NotificationChannel channel =
          new NotificationChannel(MESSAGES_CHANNEL_ID, "채팅 메시지", NotificationManager.IMPORTANCE_HIGH);
      channel.setDescription("채팅 메시지 알림");
      channel.enableVibration(true);
      channel.enableLights(true);
      channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        channel.setAllowBubbles(false);
      }
      nm.createNotificationChannel(channel);
      existing = channel;
    }

    logMessagesChannelAudit(existing);
  }

  private static void logMessagesChannelAudit(NotificationChannel channel) {
    if (channel == null) return;
    Log.i(
        TAG,
        "[notify-channel] messages_channel_audit"
            + " id="
            + channel.getId()
            + " importance="
            + channel.getImportance()
            + " lockscreenVisibility="
            + channel.getLockscreenVisibility()
            + " vibration="
            + channel.shouldVibrate()
            + " sound="
            + (channel.getSound() != null ? "set" : "default"));
  }

  private void ensureMessagesChannel() {
    ensureMessagesChannelStatic(this);
  }

  private void showMessageNotification(
      String title,
      String body,
      String url,
      String tag,
      String notificationId,
      String type,
      int badgeCount,
      Map<String, String> data) {
    if (notificationId != null && shouldSkipEventDedupe(notificationId)) {
      Log.i(TAG, "[notify-message] native_notification_dedupe eventId=" + notificationId);
      return;
    }
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
    if (badgeCount > 0) {
      builder.setNumber(badgeCount);
    }

    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify(requestCode, builder.build());
      String previewKind = data != null ? firstNonEmpty(data.get("previewKind")) : null;
      String senderName = data != null ? firstNonEmpty(data.get("senderName")) : null;
      Log.i(
          TAG,
          "[notify-message] native_notification_posted title="
              + safeTitle
              + " body="
              + safeBody
              + " previewKind="
              + (previewKind != null ? previewKind : "-")
              + " senderName="
              + (senderName != null ? senderName : "-")
              + " badge="
              + badgeCount);
    }
  }

  static void ensureAdminAdsChannelStatic(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;

    NotificationChannel existing = nm.getNotificationChannel(ADMIN_ADS_CHANNEL_ID);
    if (existing != null && existing.getImportance() < NotificationManager.IMPORTANCE_HIGH) {
      nm.deleteNotificationChannel(ADMIN_ADS_CHANNEL_ID);
      existing = null;
      Log.i(TAG, "[notify-channel] admin_ads_channel_recreate reason=degraded_importance");
    }

    if (existing == null) {
      NotificationChannel channel =
          new NotificationChannel(ADMIN_ADS_CHANNEL_ID, "광고·공지", NotificationManager.IMPORTANCE_HIGH);
      channel.setDescription("광고 및 공지 알림");
      channel.enableVibration(true);
      channel.enableLights(true);
      channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      nm.createNotificationChannel(channel);
    }
  }

  private void ensureAdminAdsChannel() {
    ensureAdminAdsChannelStatic(this);
  }

  private void showAdminNotification(
      String title,
      String body,
      String url,
      String tag,
      String notificationId,
      String type,
      Map<String, String> data) {
    if (notificationId != null && shouldSkipEventDedupe(notificationId)) {
      Log.i(TAG, "[notify-admin] native_notification_dedupe eventId=" + notificationId);
      return;
    }
    ensureAdminAdsChannel();
    Intent launch = new Intent(this, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (url != null && !url.isEmpty()) {
      if (url.startsWith("/")) {
        launch.putExtra("url", url);
      } else {
        launch.setData(Uri.parse(url));
      }
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
    String optOut = data != null ? firstNonEmpty(data.get("optOutText")) : null;
    String baseBody = body != null ? body : "";
    String safeBody = optOut != null && !optOut.isEmpty() ? baseBody + "\n" + optOut : baseBody;

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, ADMIN_ADS_CHANNEL_ID)
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
      Log.i(
          TAG,
          "[notify-admin] native_notification_posted type="
              + type
              + " title="
              + safeTitle
              + " body="
              + safeBody);
    }
  }
}
