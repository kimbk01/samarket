package com.dibay.app.callv4;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** V4 Telegram Lane native flag — mirrors Web `NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE`. */
public final class CallV4Lane {
  public static final String TAG = "DIBAY_CALL_V4";

  private static final String PREFS = "dibay_call_lane";
  private static final String KEY_V4 = "v4_telegram_lane";

  private CallV4Lane() {}

  /** Legacy V3 web replay path (`/calls/:id`), not V4 (`/calls-v4/:id`). */
  public static boolean isV3CallReplayPath(String appPath) {
    if (appPath == null || appPath.trim().isEmpty()) return false;
    String path = appPath.trim();
    if (path.startsWith("/community-messenger/calls-v4/")) return false;
    return path.startsWith("/community-messenger/calls/");
  }

  /** V4 ON — block MainActivity V3 wake / persist / inject / replay. */
  public static boolean shouldSuppressV3CallReplay(Context context, String appPath) {
    return isTelegramLaneEnabled(context) && isV3CallReplayPath(appPath);
  }

  public static boolean isTelegramLaneEnabled(Context context) {
    if (context == null) return false;
    Context app = context.getApplicationContext();
    boolean prefsValue =
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_V4, false);
    if (prefsValue) {
      Log.i(TAG, "[DIBAY_CALL_V4] lane_enabled source=shared_prefs");
      return true;
    }
    boolean assetValue = readAssetFlag(app);
    if (assetValue) {
      Log.i(TAG, "[DIBAY_CALL_V4] lane_enabled source=assets");
    }
    return assetValue;
  }

  private static boolean readAssetFlag(Context app) {
    try (InputStream in = app.getAssets().open("dibay-call-lane.json");
        BufferedReader reader =
            new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line);
      }
      JSONObject root = new JSONObject(sb.toString());
      return root.optBoolean("v4TelegramLane", false);
    } catch (Exception e) {
      Log.w(TAG, "[DIBAY_CALL_V4] lane_flag_read_failed err=" + e.getMessage());
      return false;
    }
  }
}
