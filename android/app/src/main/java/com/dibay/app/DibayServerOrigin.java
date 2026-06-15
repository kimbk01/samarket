package com.dibay.app;

import android.content.Context;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Reads Capacitor `server.url` from packaged assets. */
public final class DibayServerOrigin {
  private DibayServerOrigin() {}

  public static String resolve(Context context) {
    if (context == null) return null;
    try (InputStream in = context.getAssets().open("capacitor.config.json");
        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line);
      }
      JSONObject root = new JSONObject(sb.toString());
      JSONObject server = root.optJSONObject("server");
      if (server == null) return null;
      String url = server.optString("url", "").trim();
      if (url.endsWith("/")) return url.substring(0, url.length() - 1);
      return url.isEmpty() ? null : url;
    } catch (Exception e) {
      return null;
    }
  }
}
