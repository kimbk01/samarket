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
import java.util.Map;

/**
 * FCM 수신 — data-only 페이로드 → 채팅 알림(제목·본문) + 수신 통화(Full Screen).
 * notification 블록 없이 data-only 로 보내야 background/killed 에서도 onMessageReceived 가 호출된다.
 */
public class DibayFirebaseMessagingService extends FirebaseMessagingService {
  private static final String TAG = "DIBAY_FCM";
  /** v2: HIGH importance — 구 채널(dibay_messages)은 DEFAULT 로 고정될 수 있음 */
  static final String MESSAGES_CHANNEL_ID = "dibay_messages_v2";

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Map<String, String> data = message.getData();
    if (data == null || data.isEmpty()) {
      RemoteMessage.Notification n = message.getNotification();
      if (n != null) {
        showMessageNotification(n.getTitle(), n.getBody(), null, null);
      }
      return;
    }

    String callPushKind = data.get("call_push_kind");
    String sessionId = data.get("sessionId");
    if (sessionId == null) sessionId = data.get("session_id");

    if ("call_canceled".equals(callPushKind)) {
      if (sessionId != null) {
        IncomingCallNotificationBuilder.dismissIncomingCall(this, sessionId);
      }
      return;
    }

    String title = firstNonEmpty(data.get("title"));
    String body = firstNonEmpty(data.get("body"));
    if (title == null && message.getNotification() != null) {
      title = message.getNotification().getTitle();
    }
    if (body == null && message.getNotification() != null) {
      body = message.getNotification().getBody();
    }

    if ("missed_call".equals(callPushKind)) {
      if (sessionId != null) {
        IncomingCallNotificationBuilder.dismissIncomingCall(this, sessionId);
      }
      String url = resolveMessageDeepLink(data);
      showMessageNotification(
          title != null ? title : "부재중 통화",
          body != null ? body : "",
          url,
          data.get("tag"));
      Log.i(TAG, "missed_call sessionId=" + sessionId);
      return;
    }

    boolean isIncomingCall = "1".equals(data.get("dibay_call")) || "incoming_call".equals(callPushKind);
    if (isIncomingCall && sessionId != null) {
      if (MainActivity.isAppVisibleForIncomingCall()) {
        Log.i(TAG, "incoming_call_app_visible_delegate_to_web sessionId=" + sessionId);
        return;
      }
      /** https URL 은 MainActivity 에서 query(action=accept) 가 유실될 수 있어 dibay 스킴만 사용 */
      String dibayCallUrl = "dibay://call/" + sessionId;
      IncomingCallNotificationBuilder.showIncomingCall(this, sessionId, title, body, dibayCallUrl);
      Log.i(TAG, "incoming_call sessionId=" + sessionId);
      return;
    }

    showMessageNotification(title, body, resolveMessageDeepLink(data), data.get("tag"));
  }

  @Override
  public void onNewToken(String token) {
    Log.i(TAG, "token_refresh length=" + (token != null ? token.length() : 0));
  }

  private static String firstNonEmpty(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String resolveMessageDeepLink(Map<String, String> data) {
    String url = data.get("url");
    if (url != null && !url.isEmpty()) return url;
    String roomId = data.get("roomId");
    if (roomId == null) roomId = data.get("room_id");
    if (roomId != null && !roomId.isEmpty()) {
      return "dibay://chat/" + roomId;
    }
    return null;
  }

  private void ensureMessagesChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(MESSAGES_CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(MESSAGES_CHANNEL_ID, "메시지 알림", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("채팅·주문·커뮤니티 알림");
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(channel);
  }

  private void showMessageNotification(String title, String body, String url, String tag) {
    ensureMessagesChannel();
    Intent launch = new Intent(this, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    if (url != null && !url.isEmpty()) {
      launch.setData(Uri.parse(url));
    } else {
      launch.setAction(Intent.ACTION_MAIN);
    }
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

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
