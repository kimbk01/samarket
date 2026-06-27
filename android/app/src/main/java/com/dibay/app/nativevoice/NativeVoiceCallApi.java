package com.dibay.app.nativevoice;

import android.content.Context;
import android.webkit.CookieManager;
import com.dibay.app.DibayServerOrigin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Native HTTP facade for voice runtime. Uses the same server APIs as Web V4. */
public final class NativeVoiceCallApi {
  public interface PatchCallback {
    void onDone(boolean ok, int status, String error);
  }

  public interface TokenCallback {
    void onDone(TokenConnection connection, String error);
  }

  public static final class TokenConnection {
    public final String appId;
    public final String channelName;
    public final String uid;
    public final String token;

    TokenConnection(String appId, String channelName, String uid, String token) {
      this.appId = appId;
      this.channelName = channelName;
      this.uid = uid;
      this.token = token;
    }
  }

  private NativeVoiceCallApi() {}

  public static void acceptAsync(Context context, String callId, PatchCallback callback) {
    patchAsync(context, callId, "accept", "accept_patch_start", "accept_patch_done", callback);
  }

  public static void rejectAsync(Context context, String callId, PatchCallback callback) {
    patchAsync(context, callId, "reject", "reject_patch_start", "reject_patch_done", callback);
  }

  public static void endAsync(Context context, String callId, PatchCallback callback) {
    patchAsync(context, callId, "end", "end_patch_start", "end_patch_done", callback);
  }

  public static void missedAsync(Context context, String callId, PatchCallback callback) {
    patchAsync(context, callId, "missed", "missed_patch_start", "missed_patch_done", callback);
  }

  /** Caller-side join entry — uses the same token contract as callee accept. */
  public static void startCallerJoinAsync(
      Context context,
      String callId,
      String roomId,
      String peerUserId,
      String peerName,
      String mediaType) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    NativeVoiceCallRuntime.handleOutgoing(
        context.getApplicationContext(),
        callId.trim(),
        roomId,
        peerUserId,
        peerName,
        mediaType);
  }

  public static void fetchTokenAsync(Context context, String callId, TokenCallback callback) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    NativeVoiceCallLog.info("token_fetch_start", sid);
    new Thread(
            () -> {
              HttpURLConnection conn = null;
              try {
                String origin = DibayServerOrigin.resolve(app);
                if (origin == null || origin.isEmpty()) {
                  finishToken(callback, null, "no_server_origin");
                  return;
                }
                URL url =
                    new URL(
                        origin
                            + "/api/community-messenger/calls/sessions/"
                            + URLEncoder.encode(sid, "UTF-8")
                            + "/token");
                conn = open(app, origin, url);
                conn.setRequestMethod("GET");
                int status = conn.getResponseCode();
                String body = readBody(conn, status);
                JSONObject json = body != null && !body.isEmpty() ? new JSONObject(body) : new JSONObject();
                JSONObject connection = json.optJSONObject("connection");
                if (status < 200 || status >= 300 || !json.optBoolean("ok", false) || connection == null) {
                  finishToken(callback, null, "status=" + status + " reason=" + json.optString("reason", json.optString("error", "token_failed")));
                  return;
                }
                TokenConnection token =
                    new TokenConnection(
                        connection.optString("appId", ""),
                        connection.optString("channelName", ""),
                        connection.optString("uid", ""),
                        connection.optString("token", ""));
                if (token.appId.isEmpty() || token.channelName.isEmpty() || token.uid.isEmpty()) {
                  finishToken(callback, null, "missing_connection_fields");
                  return;
                }
                NativeVoiceCallLog.info("token_fetch_done", sid, "status=" + status);
                finishToken(callback, token, null);
              } catch (Exception error) {
                finishToken(callback, null, error.getClass().getSimpleName());
              } finally {
                if (conn != null) conn.disconnect();
              }
            })
        .start();
  }

  private static void patchAsync(
      Context context,
      String callId,
      String action,
      String startMarker,
      String doneMarker,
      PatchCallback callback) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    NativeVoiceCallLog.info(startMarker, sid);
    new Thread(
            () -> {
              HttpURLConnection conn = null;
              try {
                String origin = DibayServerOrigin.resolve(app);
                if (origin == null || origin.isEmpty()) {
                  finishPatch(callback, false, 0, "no_server_origin");
                  return;
                }
                URL url =
                    new URL(
                        origin
                            + "/api/community-messenger/calls/sessions/"
                            + URLEncoder.encode(sid, "UTF-8"));
                conn = open(app, origin, url);
                conn.setRequestMethod("PATCH");
                conn.setDoOutput(true);
                byte[] body = ("{\"action\":\"" + action + "\"}").getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = conn.getOutputStream()) {
                  os.write(body);
                }
                int status = conn.getResponseCode();
                boolean ok = status >= 200 && status < 300;
                if (ok) {
                  NativeVoiceCallLog.info(doneMarker, sid, "status=" + status);
                } else {
                  NativeVoiceCallLog.warn("error_terminal", sid, "action=" + action + " status=" + status);
                }
                finishPatch(callback, ok, status, ok ? null : "status=" + status);
              } catch (Exception error) {
                NativeVoiceCallLog.warn("error_terminal", sid, "action=" + action + " err=" + error.getClass().getSimpleName());
                finishPatch(callback, false, 0, error.getClass().getSimpleName());
              } finally {
                if (conn != null) conn.disconnect();
              }
            })
        .start();
  }

  private static HttpURLConnection open(Context context, String origin, URL url) throws Exception {
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setConnectTimeout(8_000);
    conn.setReadTimeout(8_000);
    conn.setRequestProperty("Accept", "application/json");
    conn.setRequestProperty("Content-Type", "application/json");
    String cookie = CookieManager.getInstance().getCookie(origin);
    if (cookie != null && !cookie.isEmpty()) {
      conn.setRequestProperty("Cookie", cookie);
    }
    return conn;
  }

  private static String readBody(HttpURLConnection conn, int status) {
    try {
      InputStream stream = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
      if (stream == null) return "";
      try (BufferedReader reader =
          new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
          out.append(line);
        }
        return out.toString();
      }
    } catch (Exception error) {
      return "";
    }
  }

  private static void finishPatch(PatchCallback callback, boolean ok, int status, String error) {
    if (callback != null) callback.onDone(ok, status, error);
  }

  private static void finishToken(TokenCallback callback, TokenConnection connection, String error) {
    if (callback != null) callback.onDone(connection, error);
  }
}
