package com.dibay.app;

import android.content.Context;
import android.util.Log;
import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Native PATCH for call session actions — uses WebView session cookies. */
public final class CallSessionPatchHelper {
  private static final String TAG = "DIBAY_CALL_FLOW";

  private CallSessionPatchHelper() {}

  public static boolean patch(Context context, String sessionId, String action) {
    if (context == null || sessionId == null || sessionId.trim().isEmpty()) return false;
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      Log.w(TAG, "[call-flow] patch_failed reason=no_server_origin");
      return false;
    }
    HttpURLConnection conn = null;
    try {
      String normalizedAction = action != null ? action.trim() : "";
      if ("accept".equals(normalizedAction)
          || "reject".equals(normalizedAction)
          || "missed".equals(normalizedAction)
          || "end".equals(normalizedAction)) {
        URL actionUrl =
            new URL(
                origin
                    + "/api/community-messenger/calls/"
                    + java.net.URLEncoder.encode(sessionId.trim(), "UTF-8")
                    + "/"
                    + normalizedAction);
        boolean actionOk = postJson(context, origin, actionUrl, "{}");
        if (actionOk) return true;
      }
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/sessions/"
                  + java.net.URLEncoder.encode(sessionId.trim(), "UTF-8"));
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("PATCH");
      conn.setConnectTimeout(12_000);
      conn.setReadTimeout(12_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      byte[] body = ("{\"action\":\"" + action + "\"}").getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      InputStream stream = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
      String responseBody = readStream(stream);
      boolean ok = status >= 200 && status < 300;
      if (!ok) {
        Log.w(TAG, "[call-flow] patch_failed status=" + status + " body=" + responseBody);
      }
      return ok;
    } catch (Exception e) {
      Log.w(TAG, "[call-flow] patch_failed message=" + e.getMessage());
      return false;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static boolean postJson(Context context, String origin, URL url, String jsonBody) {
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(12_000);
      conn.setReadTimeout(12_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      byte[] body = jsonBody.getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      boolean ok = status >= 200 && status < 300;
      if (!ok) {
        Log.w(TAG, "[call-flow] post_action_failed status=" + status + " body=" + readStream(conn.getErrorStream()));
      }
      return ok;
    } catch (Exception e) {
      Log.w(TAG, "[call-flow] post_action_failed message=" + e.getMessage());
      return false;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static String readStream(InputStream stream) {
    if (stream == null) return "";
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line);
      }
      return sb.toString();
    } catch (Exception e) {
      return "";
    }
  }
}

/** Reads Capacitor `server.url` from packaged assets. */
final class DibayServerOrigin {
  private DibayServerOrigin() {}

  static String resolve(Context context) {
    if (context == null) return null;
    try (InputStream in = context.getAssets().open("capacitor.config.json");
        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line);
      }
      org.json.JSONObject root = new org.json.JSONObject(sb.toString());
      org.json.JSONObject server = root.optJSONObject("server");
      if (server == null) return null;
      String url = server.optString("url", "").trim();
      if (url.endsWith("/")) return url.substring(0, url.length() - 1);
      return url.isEmpty() ? null : url;
    } catch (Exception e) {
      return null;
    }
  }
}
