package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Canonical call/push device identity — must match {@code user_devices.device_id}
 * ({@code dibay:client_instance_id} from Web register), not ANDROID_ID.
 *
 * @see docs/dibay-call-multi-device-policy.md
 */
public final class DibayCanonicalDeviceIdStore {
  private static final String PREFS = "dibay_device_identity";
  private static final String KEY = "canonical_device_id";

  private DibayCanonicalDeviceIdStore() {}

  public static void save(Context context, String deviceId) {
    if (context == null) return;
    String id = deviceId != null ? deviceId.trim() : "";
    if (id.isEmpty()) return;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().putString(KEY, id).apply();
  }

  /** Prefer registered canonical id; empty if never registered on this install. */
  public static String resolveOrEmpty(Context context) {
    if (context == null) return "";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String id = prefs.getString(KEY, "");
    return id != null ? id.trim() : "";
  }
}
