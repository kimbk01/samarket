package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Last FCM/APNS token successfully bound to {@code user_devices} on this install.
 * Used as logout ownership proof with {@link DibayCanonicalDeviceIdStore} when session cookies are gone.
 */
public final class DibayBoundPushTokenStore {
  private static final String PREFS = "dibay_bound_push_token";
  private static final String KEY_TOKEN = "push_token";
  private static final String KEY_PROVIDER = "push_provider";

  private DibayBoundPushTokenStore() {}

  public static void save(Context context, String pushToken, String pushProvider) {
    if (context == null) return;
    String token = pushToken != null ? pushToken.trim() : "";
    if (token.isEmpty()) return;
    String provider =
        pushProvider != null && !pushProvider.trim().isEmpty()
            ? pushProvider.trim().toLowerCase()
            : "fcm";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().putString(KEY_TOKEN, token).putString(KEY_PROVIDER, provider).apply();
  }

  public static String resolveTokenOrEmpty(Context context) {
    if (context == null) return "";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String token = prefs.getString(KEY_TOKEN, "");
    return token != null ? token.trim() : "";
  }

  public static String resolveProviderOrFcm(Context context) {
    if (context == null) return "fcm";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String provider = prefs.getString(KEY_PROVIDER, "fcm");
    if (provider == null || provider.trim().isEmpty()) return "fcm";
    return provider.trim().toLowerCase();
  }

  public static void clear(Context context) {
    if (context == null) return;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().clear().apply();
  }
}
