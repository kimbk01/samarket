package com.dibay.app.opening;

import android.app.Activity;
import android.util.Log;
import com.dibay.app.MainActivity;
import org.json.JSONObject;

public final class OpeningRuntimeCoordinator {
  private static final String TAG = "OpeningRuntime";

  private OpeningRuntimeCoordinator() {}

  public static void presentIfReady(Activity activity) {
    if (activity == null) return;
    if (OpeningPlayerSurface.isShowing()) return;
    if (!OpeningPackStore.isReady(activity)) {
      Log.i(TAG, "cold_start skip reason=pack_not_ready");
      return;
    }
    try {
      JSONObject manifest = OpeningPackStore.readManifest(activity);
      MainActivity.releaseSplashForOpeningPlayer();
      OpeningPlayerSurface.present(activity, manifest, () -> Log.i(TAG, "opening_end home"));
    } catch (Exception e) {
      Log.w(TAG, "present_failed " + e.getMessage());
    }
  }
}
