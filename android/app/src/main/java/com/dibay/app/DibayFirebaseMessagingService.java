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
 * FCM 수신 — 채팅/주문 알림 + 수신 통화(Full Screen).
 */
public class DibayFirebaseMessagingService extends FirebaseMessagingService {
  private static final String TAG = "DIBAY_FCM";
  static final String MESSAGES_CHANNEL_ID = "dibay_messages";

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Map<String, String> data = message.getData();
    if (data == null || data.isEmpty()) {
      RemoteMessage.Notification n = message.getNotification();
      if (n != null) {
        showMessageNotification(n.getTitle(), n.getBody(), null);
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

    boolean isCall = "1".equals(data.get("dibay_call")) || "incoming_call".equals(callPushKind);
    String title = data.get("title");
    String body = data.get("body");
    if (title == null && message.getNotification() != null) {
      title = message.getNotification().getTitle();
    }
    if (body == null && message.getNotification() != null) {
      body = message.getNotification().getBody();
    }

    if (isCall && sessionId != null) {
      String url = data.get("url");
      if (url == null || url.isEmpty()) {
        url = "dibay://call/" + sessionId;
      }
      IncomingCallNotificationBuilder.showIncomingCall(this, sessionId, title, body, url);
      Log.i(TAG, "incoming_call sessionId=" + sessionId);
      return;
    }

    String url = data.get("url");
    String roomId = data.get("roomId");
    if (roomId == null) roomId = data.get("room_id");
    if ((url == null || url.isEmpty()) && roomId != null && !roomId.isEmpty()) {
      url = "dibay://chat/" + roomId;
    }
    showMessageNotification(title, body, url);
  }

  @Override
  public void onNewToken(String token) {
    Log.i(TAG, "token_refresh length=" + (token != null ? token.length() : 0));
  }

  private void ensureMessagesChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(MESSAGES_CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(MESSAGES_CHANNEL_ID, "알림", NotificationManager.IMPORTANCE_DEFAULT);
    channel.setDescription("채팅·주문·커뮤니티 알림");
    nm.createNotificationChannel(channel);
  }

  private void showMessageNotification(String title, String body, String url) {
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
    PendingIntent pi = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), launch, flags);

    Notification notification =
        new NotificationCompat.Builder(this, MESSAGES_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title != null && !title.isEmpty() ? title : "DIBAY")
            .setContentText(body != null ? body : "")
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();

    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), notification);
    }
  }
}
