package com.dibay.app.nativevoice;

import android.content.Context;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Feature gate for Android Native Voice Runtime. Voice only; video stays on V4 fallback. */
public final class NativeVoiceCallLane {
  private static volatile Boolean cachedEnabled;

  private NativeVoiceCallLane() {}

  public static boolean isEnabled(Context context) {
    Boolean cached = cachedEnabled;
    if (cached != null) return cached;
    boolean enabled = readEnabled(context);
    cachedEnabled = enabled;
    if (enabled) {
      NativeVoiceCallLog.info("native_voice_flag_enabled", "unknown");
    }
    return enabled;
  }

  public static boolean isVoiceMediaType(String mediaType) {
    String normalized = mediaType != null ? mediaType.trim().toLowerCase() : "";
    return "voice".equals(normalized) || "audio".equals(normalized);
  }

  public static boolean shouldHandleIncoming(Context context, String mediaType) {
    return isEnabled(context) && isVoiceMediaType(mediaType);
  }

  private static boolean readEnabled(Context context) {
    if (context == null) return false;
    try {
      Context app = context.getApplicationContext();
      try (InputStream in = app.getAssets().open("dibay-call-lane.json");
          BufferedReader reader =
              new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
          sb.append(line);
        }
        JSONObject json = new JSONObject(sb.toString());
        return json.optBoolean("nativeVoiceRuntime", false);
      }
    } catch (Exception error) {
      return false;
    }
  }
}
