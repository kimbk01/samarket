package com.dibay.app;

import android.content.Context;
import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Short server truth probe for late incoming-call FCM delivery. */
public final class IncomingCallSessionStatusProbe {
  private IncomingCallSessionStatusProbe() {}

  public static boolean shouldProbe(DibayCallPushLog.ExpiryDecision expiry) {
    return expiry != null && expiry.deliveryDelayMs >= 10_000L;
  }

  public static String fetchStatus(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return null;
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) return null;
    HttpURLConnection conn = null;
    try {
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/sessions/"
                  + URLEncoder.encode(callId.trim(), "UTF-8"));
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("GET");
      conn.setConnectTimeout(1_200);
      conn.setReadTimeout(1_200);
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      int status = conn.getResponseCode();
      if (status < 200 || status >= 300) {
        DibayCallPushLog.warn("incoming_status_probe_failed", callId, "status=" + status);
        return null;
      }
      String body = readBody(conn.getInputStream());
      JSONObject json = new JSONObject(body);
      JSONObject session = json.optJSONObject("session");
      String sessionStatus = session != null ? session.optString("status", "") : "";
      return sessionStatus != null && !sessionStatus.trim().isEmpty() ? sessionStatus.trim() : null;
    } catch (Exception error) {
      DibayCallPushLog.warn("incoming_status_probe_failed", callId, "err=" + error.getClass().getSimpleName());
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  public static boolean isTerminalStatus(String status) {
    if (status == null) return false;
    switch (status.trim().toLowerCase()) {
      case "cancelled":
      case "canceled":
      case "rejected":
      case "missed":
      case "ended":
      case "active":
        return true;
      default:
        return false;
    }
  }

  /** Late incoming must not present after another device accepted. */
  public static boolean shouldDismissIncomingForStatus(String status) {
    return isTerminalStatus(status);
  }

  private static String readBody(InputStream input) throws Exception {
    StringBuilder sb = new StringBuilder();
    try (BufferedReader br =
        new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) {
        sb.append(line);
      }
    }
    return sb.toString();
  }
}
