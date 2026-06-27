package com.dibay.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;
import com.dibay.app.callv4.CallV4Lane;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * V4 callee accept PATCH from native — lock/sleep path without WebView hydration gate.
 *
 * <p>Unlocked foreground accept remains Web-owned via MainActivity route; this helper serves
 * {@code native_lock_accept} where IncomingCallActivity stays above keyguard.
 */
public final class IncomingCallAcceptPatchHelper {
  private IncomingCallAcceptPatchHelper() {}

  public static void sendAsync(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "native_accept";
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_patch_start callId=" + sid + " source=" + src);
    new Thread(() -> patch(app, sid, src)).start();
  }

  private static void patch(Context context, String callId, String source) {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_patch_failed callId=" + callId + " reason=no_server_origin");
      notifyPatchResult(context, callId, false);
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
      conn.setConnectTimeout(8_000);
      conn.setReadTimeout(8_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      byte[] body = "{\"action\":\"accept\"}".getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      if (status >= 200 && status < 300) {
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] accept_patch_done callId=" + callId + " status=" + status + " source=" + source);
        DibayIncomingCallNativeStore.markState(context, callId, DibayIncomingCallNativeStore.STATE_ACTIVE);
        notifyPatchResult(context, callId, true);
        return;
      }
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_patch_failed callId="
              + callId
              + " status="
              + status
              + " source="
              + source);
    } catch (Exception error) {
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_patch_failed callId="
              + callId
              + " err="
              + error.getClass().getSimpleName()
              + " source="
              + source);
    } finally {
      if (conn != null) conn.disconnect();
    }
    notifyPatchResult(context, callId, false);
  }

  private static void notifyPatchResult(Context context, String callId, boolean ok) {
    new Handler(Looper.getMainLooper())
        .post(() -> IncomingCallActivity.onNativeAcceptPatchResult(context, callId, ok));
  }
}
