package com.dibay.app.nativepush;

import android.content.Context;
import android.util.Log;
import android.webkit.CookieManager;
import com.dibay.app.DibayServerOrigin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** B-0: native HTTP POST for /api/me/devices/register — WebView fetch bypass proof. */
public final class NativePushRegisterHelper {
  private static final String TAG = "DIBAY_PUSH_REGISTER";
  private static final int CONNECT_TIMEOUT_MS = 8_000;
  private static final int READ_TIMEOUT_MS = 8_000;

  private NativePushRegisterHelper() {}

  public static final class RegisterRequest {
    public final String platform;
    public final String deviceId;
    public final String pushToken;
    public final String pushProvider;
    public final String appVersion;
    public final String userId;

    public RegisterRequest(
        String platform,
        String deviceId,
        String pushToken,
        String pushProvider,
        String appVersion,
        String userId) {
      this.platform = platform != null ? platform.trim() : "";
      this.deviceId = deviceId != null ? deviceId.trim() : "";
      this.pushToken = pushToken != null ? pushToken.trim() : "";
      this.pushProvider = pushProvider != null ? pushProvider.trim() : "fcm";
      this.appVersion = appVersion != null ? appVersion.trim() : null;
      this.userId = userId != null ? userId.trim() : null;
    }
  }

  public static final class RegisterResult {
    public final boolean ok;
    public final int httpStatus;
    public final String error;
    public final String deviceRowId;

    RegisterResult(boolean ok, int httpStatus, String error, String deviceRowId) {
      this.ok = ok;
      this.httpStatus = httpStatus;
      this.error = error;
      this.deviceRowId = deviceRowId;
    }
  }

  public static RegisterResult register(Context context, RegisterRequest request) {
    logStep(
        "native_register_post_started",
        request,
        "http_status",
        -1,
        "ok",
        false,
        null);

    if (request.deviceId.isEmpty() || request.pushToken.isEmpty()) {
      logStep(
          "native_register_post_done",
          request,
          "http_status",
          0,
          "ok",
          false,
          "invalid_device");
      return new RegisterResult(false, 0, "invalid_device", null);
    }

    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      logStep(
          "native_register_post_done",
          request,
          "http_status",
          0,
          "ok",
          false,
          "no_server_origin");
      return new RegisterResult(false, 0, "no_server_origin", null);
    }

    String cookie = CookieManager.getInstance().getCookie(origin);
    if (cookie == null || cookie.trim().isEmpty()) {
      logStep(
          "native_register_post_done",
          request,
          "http_status",
          0,
          "ok",
          false,
          "no_cookie");
      return new RegisterResult(false, 0, "no_cookie", null);
    }

    HttpURLConnection conn = null;
    try {
      URL url = new URL(origin + "/api/me/devices/register");
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
      conn.setReadTimeout(READ_TIMEOUT_MS);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Cookie", cookie);

      JSONObject body = new JSONObject();
      body.put("platform", request.platform.isEmpty() ? "android" : request.platform);
      body.put("device_id", request.deviceId);
      body.put("push_token", request.pushToken);
      body.put("push_provider", request.pushProvider.isEmpty() ? "fcm" : request.pushProvider);
      if (request.appVersion != null && !request.appVersion.isEmpty()) {
        body.put("app_version", request.appVersion);
      }
      if (request.userId != null && !request.userId.isEmpty()) {
        body.put("user_id", request.userId);
      }

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
      String deviceRowId =
          json != null && json.has("device_row_id") && !json.isNull("device_row_id")
              ? json.optString("device_row_id", null)
              : null;
      String error =
          json != null && json.has("error") && !json.isNull("error")
              ? json.optString("error", "register_failed")
              : "register_failed";

      boolean ok = status >= 200 && status < 300 && responseOk;
      if (ok) {
        logStep(
            "native_register_post_done",
            request,
            "http_status",
            status,
            "ok",
            true,
            null);
        return new RegisterResult(true, status, null, deviceRowId);
      }

      logStep(
          "native_register_post_done",
          request,
          "http_status",
          status,
          "ok",
          false,
          error);
      return new RegisterResult(false, status, error, deviceRowId);
    } catch (Exception error) {
      String err = error.getClass().getSimpleName();
      logStep(
          "native_register_post_done",
          request,
          "http_status",
          0,
          "ok",
          false,
          err);
      return new RegisterResult(false, 0, err, null);
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static JSONObject parseJson(String body) {
    try {
      if (body == null || body.trim().isEmpty()) return new JSONObject();
      return new JSONObject(body);
    } catch (Exception ignored) {
      return null;
    }
  }

  private static String readBody(InputStream input) {
    if (input == null) return "";
    StringBuilder sb = new StringBuilder();
    try (BufferedReader br =
        new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) {
        sb.append(line);
      }
    } catch (Exception ignored) {
      return "";
    }
    return sb.toString();
  }

  private static void logStep(
      String step,
      RegisterRequest request,
      String statusKey,
      int httpStatus,
      String okKey,
      boolean ok,
      String error) {
    try {
      JSONObject detail = new JSONObject();
      detail.put("step", step);
      detail.put("platform", request.platform);
      detail.put("push_provider", request.pushProvider);
      detail.put("device_id", request.deviceId);
      detail.put("push_token_len", request.pushToken.length());
      if (request.userId != null && !request.userId.isEmpty()) {
        detail.put("user_id", request.userId);
      }
      detail.put(statusKey, httpStatus);
      detail.put(okKey, ok);
      if (error != null && !error.isEmpty()) {
        detail.put("error", error);
      }
      Log.i(TAG, detail.toString());
    } catch (Exception ignored) {
      Log.i(TAG, step);
    }
  }
}
