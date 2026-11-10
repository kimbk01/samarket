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

  /**
   * server.url → scheme://host[:port]. 쿼리(개발 앱 Vercel 보호 우회 값 등)·경로·fragment 는 버린다.
   * 운영 server.url(https://samarket.vercel.app)은 결과가 같다.
   * (2026-11-11 Owner 승인, docs/audit/dev-app-native-origin-plan-2026-11-11.md)
   */
  static String originOf(String raw) {
    if (raw == null) return null;
    String url = raw.trim();
    if (url.isEmpty()) return null;
    try {
      java.net.URI uri = new java.net.URI(url);
      String scheme = uri.getScheme();
      String host = uri.getHost();
      if (scheme != null && host != null && !host.isEmpty()) {
        int port = uri.getPort();
        return port >= 0 ? scheme + "://" + host + ":" + port : scheme + "://" + host;
      }
    } catch (Exception ignored) {
      // 아래 기존 처리(끝 슬래시 제거)로 진행
    }
    while (url.endsWith("/")) {
      url = url.substring(0, url.length() - 1);
    }
    return url.isEmpty() ? null : url;
  }

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
        String url = originOf(server.optString("url", ""));
        if (url == null) return null;
        cachedOrigin = url;
        return cachedOrigin;
      }
    } catch (Exception e) {
      Log.w(TAG, "resolve_failed", e);
      return null;
    }
  }
}
