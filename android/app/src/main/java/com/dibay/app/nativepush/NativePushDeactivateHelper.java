package com.dibay.app.nativepush;

import android.content.Context;
import android.util.Log;
import com.dibay.app.DibayBoundPushTokenStore;
import com.dibay.app.DibayCallAuthEligibilityStore;
import com.dibay.app.DibayCanonicalDeviceIdStore;
import com.dibay.app.DibayServerOrigin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Cookie-independent device unbind using device_id + push_token proof.
 * Used when WebView session is already guest / missing.
 */
public final class NativePushDeactivateHelper {
  private static final String TAG = "DIBAY_PUSH_DEACTIVATE";
  private static final int CONNECT_TIMEOUT_MS = 8_000;
  private static final int READ_TIMEOUT_MS = 8_000;

  private NativePushDeactivateHelper() {}

  public static final class DeactivateResult {
    public final boolean ok;
    public final int httpStatus;
    public final String error;
    public final int deactivated;

    DeactivateResult(boolean ok, int httpStatus, String error, int deactivated) {
      this.ok = ok;
      this.httpStatus = httpStatus;
      this.error = error;
      this.deactivated = deactivated;
    }
  }

  public static DeactivateResult deactivate(Context context, String reason) {
    Context app = context != null ? context.getApplicationContext() : null;
    if (app == null) {
      return new DeactivateResult(false, 0, "no_context", 0);
    }

    DibayCallAuthEligibilityStore.setEligible(app, false, "native_deactivate:" + safe(reason));

    String deviceId = DibayCanonicalDeviceIdStore.resolveOrEmpty(app);
    String pushToken = DibayBoundPushTokenStore.resolveTokenOrEmpty(app);
    String pushProvider = DibayBoundPushTokenStore.resolveProviderOrFcm(app);
    if (deviceId.isEmpty() || pushToken.isEmpty()) {
      Log.w(
          TAG,
          "native_deactivate_skipped reason=missing_proof deviceEmpty="
              + deviceId.isEmpty()
              + " tokenEmpty="
              + pushToken.isEmpty());
      return new DeactivateResult(false, 0, "missing_proof", 0);
    }

    String origin = DibayServerOrigin.resolve(app);
    if (origin == null || origin.isEmpty()) {
      return new DeactivateResult(false, 0, "no_server_origin", 0);
    }

    HttpURLConnection conn = null;
    try {
      URL url = new URL(origin + "/api/me/devices/deactivate");
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
      conn.setReadTimeout(READ_TIMEOUT_MS);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");

      JSONObject body = new JSONObject();
      body.put("device_id", deviceId);
      body.put("push_token", pushToken);
      body.put("push_provider", pushProvider);

      byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(payload.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(payload);
      }

      int status = conn.getResponseCode();
      InputStream stream = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
      String responseBody = readBody(stream);
      JSONObject json = parseJson(responseBody);
      boolean responseOk = json != null && json.optBoolean("ok", false);
      int deactivated = json != null ? json.optInt("deactivated", 0) : 0;
      String error =
          json != null && json.has("error") && !json.isNull("error")
              ? json.optString("error", "deactivate_failed")
              : "deactivate_failed";

      boolean ok = status >= 200 && status < 300 && responseOk;
      Log.i(
          TAG,
          "native_deactivate_done ok="
              + ok
              + " http_status="
              + status
              + " deactivated="
              + deactivated
              + " reason="
              + safe(reason));
      if (ok) {
        DibayBoundPushTokenStore.clear(app);
        return new DeactivateResult(true, status, null, deactivated);
      }
      return new DeactivateResult(false, status, error, deactivated);
    } catch (Exception error) {
      Log.w(TAG, "native_deactivate_failed", error);
      return new DeactivateResult(false, 0, error.getMessage(), 0);
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static String safe(String value) {
    return value != null ? value.trim() : "";
  }

  private static String readBody(InputStream stream) throws Exception {
    if (stream == null) return "";
    StringBuilder sb = new StringBuilder();
    try (BufferedReader reader =
        new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line);
      }
    }
    return sb.toString();
  }

  private static JSONObject parseJson(String raw) {
    if (raw == null || raw.trim().isEmpty()) return null;
    try {
      return new JSONObject(raw);
    } catch (Exception ignored) {
      return null;
    }
  }
}
