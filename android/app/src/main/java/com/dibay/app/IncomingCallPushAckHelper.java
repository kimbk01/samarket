package com.dibay.app;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.webkit.CookieManager;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Best-effort server ack for native FCM receive diagnostics. Never blocks incoming UI. */
public final class IncomingCallPushAckHelper {
  private IncomingCallPushAckHelper() {}

  public static void sendAsync(
      Context context,
      IncomingCallPayload payload,
      DibayCallPushLog.ExpiryDecision expiry,
      long receivedAtMs) {
    if (context == null || payload == null || !payload.isValid()) return;
    Context app = context.getApplicationContext();
    new Thread(() -> send(app, payload, expiry, receivedAtMs)).start();
  }

  private static void send(
      Context context,
      IncomingCallPayload payload,
      DibayCallPushLog.ExpiryDecision expiry,
      long receivedAtMs) {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      DibayCallPushLog.warn("push_ack_failed", payload.callId, "reason=no_server_origin");
      return;
    }
    HttpURLConnection conn = null;
    try {
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/"
                  + URLEncoder.encode(payload.callId, "UTF-8")
                  + "/push-ack");
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(4_000);
      conn.setReadTimeout(4_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      String json =
          "{"
              + "\"receivedAt\":"
              + receivedAtMs
              + ",\"deviceId\":\""
              + escape(resolveDeviceId(context))
              + "\",\"screenInteractive\":"
              + DibayKeyguardHelper.isInteractive(context)
              + ",\"keyguardLocked\":"
              + DibayKeyguardHelper.isKeyguardLocked(context)
              + ",\"deviceIdleMode\":"
              + DibayCallPushLog.isDeviceIdleMode(context)
              + ",\"notificationPermission\":"
              + IncomingCallNotificationBuilder.canPostNotifications(context)
              + ",\"channelImportance\":"
              + IncomingCallNotificationBuilder.incomingChannelImportance(context)
              + ",\"fsiAllowed\":"
              + IncomingCallNotificationBuilder.canPostFullScreenIntent(context)
              + ",\"dozeDelayMs\":"
              + (expiry != null ? expiry.deliveryDelayMs : -1L)
              + "}";
      byte[] body = json.getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      if (status >= 200 && status < 300) {
        DibayCallPushLog.info("push_ack_sent", payload.callId, "status=" + status);
      } else {
        DibayCallPushLog.warn("push_ack_failed", payload.callId, "status=" + status);
      }
    } catch (Exception error) {
      DibayCallPushLog.warn("push_ack_failed", payload.callId, "err=" + error.getClass().getSimpleName());
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static String resolveDeviceId(Context context) {
    try {
      String androidId =
          Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
      if (androidId != null && !androidId.trim().isEmpty()) return androidId.trim();
    } catch (Exception ignored) {
    }
    return Build.MANUFACTURER + ":" + Build.MODEL;
  }

  private static String escape(String raw) {
    if (raw == null) return "";
    return raw.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
