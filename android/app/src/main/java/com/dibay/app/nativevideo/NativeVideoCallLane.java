package com.dibay.app.nativevideo;

import android.content.Context;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Feature gate for Android Native Video Runtime. */
public final class NativeVideoCallLane {
  private static volatile Boolean cachedEnabled;

  private NativeVideoCallLane() {}

  public static boolean isEnabled(Context context) {
    Boolean cached = cachedEnabled;
    if (cached != null) return cached;
    boolean enabled = readEnabled(context);
    cachedEnabled = enabled;
    if (enabled) NativeVideoCallLog.info("native_video_flag_enabled", "unknown");
    return enabled;
  }

  public static boolean isVideoMediaType(String mediaType) {
    String normalized = mediaType != null ? mediaType.trim().toLowerCase() : "";
    return "video".equals(normalized);
  }

  public static boolean shouldHandleIncoming(Context context, String mediaType) {
    return isEnabled(context) && isVideoMediaType(mediaType);
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
        return json.optBoolean("nativeVideoRuntime", false);
      }
    } catch (Exception error) {
      return false;
    }
  }
}
