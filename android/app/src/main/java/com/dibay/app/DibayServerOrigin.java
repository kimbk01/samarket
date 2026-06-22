package com.dibay.app;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Capacitor `server.url` — native HTTP (push-ack, session probe) 와 WebView origin 일치 */
public final class DibayServerOrigin {
  private static final String TAG = "DibayServerOrigin";
  private static volatile String cachedOrigin;

  private DibayServerOrigin() {}

  public static String resolve(Context context) {
    if (cachedOrigin != null) return cachedOrigin;
    if (context == null) return null;
    try {
      Context app = context.getApplicationContext();
      try (InputStream in = app.getAssets().open("capacitor.config.json");
          BufferedReader reader =
              new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
          sb.append(line);
        }
        JSONObject root = new JSONObject(sb.toString());
        JSONObject server = root.optJSONObject("server");
        if (server == null) return null;
        String url = server.optString("url", "").trim();
        if (url.isEmpty()) return null;
        while (url.endsWith("/")) {
          url = url.substring(0, url.length() - 1);
        }
        cachedOrigin = url;
        return cachedOrigin;
      }
    } catch (Exception e) {
      Log.w(TAG, "resolve_failed", e);
      return null;
    }
  }
}
