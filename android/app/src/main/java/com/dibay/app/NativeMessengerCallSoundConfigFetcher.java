package com.dibay.app;

import android.content.Context;
import android.util.Log;
import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Native read-only caller for Admin call sound settings. Outgoing ringback only. */
public final class NativeMessengerCallSoundConfigFetcher {
  public interface Callback {
    void onDone(Config config);
  }

  public static final class Config {
    public final String voiceOutgoingRingbackUrl;
    public final String videoOutgoingRingbackUrl;

    Config(String voiceOutgoingRingbackUrl, String videoOutgoingRingbackUrl) {
      this.voiceOutgoingRingbackUrl = voiceOutgoingRingbackUrl;
      this.videoOutgoingRingbackUrl = videoOutgoingRingbackUrl;
    }
  }

  private static final String TAG = "DIBAY_CALL";
  private static final long CACHE_MS = 60_000L;
  private static volatile Config cachedConfig;
  private static volatile long cachedAtMs;

  private NativeMessengerCallSoundConfigFetcher() {}

  public static void fetchAsync(Context context, String callId, Callback callback) {
    if (context == null) {
      finish(callback, null);
      return;
    }
    Context app = context.getApplicationContext();
    String sid = normalize(callId);
    Config cached = cachedConfig;
    if (cached != null && System.currentTimeMillis() - cachedAtMs < CACHE_MS) {
      Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_ok callId=" + safe(sid) + " source=cache hasVoiceUrl=" + has(cached.voiceOutgoingRingbackUrl) + " hasVideoUrl=" + has(cached.videoOutgoingRingbackUrl));
      finish(callback, cached);
      return;
    }

    new Thread(
            () -> {
              HttpURLConnection conn = null;
              try {
                String origin = DibayServerOrigin.resolve(app);
                if (origin == null || origin.trim().isEmpty()) {
                  logFail(sid, "no_server_origin");
                  finish(callback, null);
                  return;
                }
                URL url = new URL(origin + "/api/app/messenger-call-sound-config");
                conn = open(origin, url);
                conn.setRequestMethod("GET");
                int status = conn.getResponseCode();
                String body = readBody(conn, status);
                JSONObject json = body != null && !body.isEmpty() ? new JSONObject(body) : new JSONObject();
                JSONObject config = json.optJSONObject("config");
                if (status < 200 || status >= 300 || !json.optBoolean("ok", false) || config == null) {
                  logFail(sid, "status=" + status);
                  finish(callback, null);
                  return;
                }
                Config next =
                    new Config(
                        normalize(config.optString("voice_outgoing_ringback_url", "")),
                        normalize(config.optString("video_outgoing_ringback_url", "")));
                cachedConfig = next;
                cachedAtMs = System.currentTimeMillis();
                Log.i(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_ok callId=" + safe(sid) + " source=network hasVoiceUrl=" + has(next.voiceOutgoingRingbackUrl) + " hasVideoUrl=" + has(next.videoOutgoingRingbackUrl));
                finish(callback, next);
              } catch (Exception error) {
                logFail(sid, error.getClass().getSimpleName());
                finish(callback, null);
              } finally {
                if (conn != null) conn.disconnect();
              }
            })
        .start();
  }

  private static HttpURLConnection open(String origin, URL url) throws Exception {
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setConnectTimeout(4_000);
    conn.setReadTimeout(4_000);
    conn.setRequestProperty("Accept", "application/json");
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

  private static void logFail(String callId, String reason) {
    Log.w(TAG, "[DIBAY_CALL] native_outgoing_ringback_config_fetch_fail callId=" + safe(callId) + " reason=" + safe(reason));
  }

  private static void finish(Callback callback, Config config) {
    if (callback != null) callback.onDone(config);
  }

  private static String normalize(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static boolean has(String value) {
    return value != null && !value.trim().isEmpty();
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
