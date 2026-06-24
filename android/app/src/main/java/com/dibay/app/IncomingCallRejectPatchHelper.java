package com.dibay.app;

import android.content.Context;
import android.util.Log;
import android.webkit.CookieManager;
import com.dibay.app.callv4.CallV4Lane;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * V4 callee reject PATCH from native — avoids BAL-blocked MainActivity reject route.
 *
 * <p>Web sheet reject remains Web-owned; notification / lock / background decline uses this helper.
 */
public final class IncomingCallRejectPatchHelper {
  private IncomingCallRejectPatchHelper() {}

  public static void sendAsync(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "native_reject";
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] reject_patch_start callId=" + sid + " source=" + src);
    new Thread(() -> patch(app, sid, src)).start();
  }

  private static void patch(Context context, String callId, String source) {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      Log.w(CallV4Lane.TAG, "[DIBAY_CALL_V4] reject_patch_failed callId=" + callId + " reason=no_server_origin");
      return;
    }
    HttpURLConnection conn = null;
    try {
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/sessions/"
                  + URLEncoder.encode(callId, "UTF-8"));
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("PATCH");
      conn.setConnectTimeout(5_000);
      conn.setReadTimeout(5_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      byte[] body = "{\"action\":\"reject\"}".getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      if (status >= 200 && status < 300) {
        Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] reject_patch_done callId=" + callId + " status=" + status);
        return;
      }
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] reject_patch_failed callId=" + callId + " status=" + status + " source=" + source);
    } catch (Exception error) {
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] reject_patch_failed callId="
              + callId
              + " err="
              + error.getClass().getSimpleName()
              + " source="
              + source);
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

}
