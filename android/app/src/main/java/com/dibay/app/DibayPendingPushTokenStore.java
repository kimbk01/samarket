package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * PUSH-01 — FCM token issued by {@code onNewToken} that the server has NOT confirmed yet.
 *
 * <p>Kept apart from {@link DibayBoundPushTokenStore}: the bound token must stay the one
 * {@code user_devices} knows, because it is the cookie-less logout ownership proof. The web layer
 * re-registers on {@code dibay:push-token-rotated}; a successful register promotes the token to the
 * bound store and clears this one. Logout tries the bound token first, then this one.
 */
public final class DibayPendingPushTokenStore {
  private static final String PREFS = "dibay_pending_push_token";
  private static final String KEY_TOKEN = "push_token";

  private DibayPendingPushTokenStore() {}

  public static void save(Context context, String pushToken) {
    if (context == null) return;
    String token = pushToken != null ? pushToken.trim() : "";
    if (token.isEmpty()) return;
    prefs(context).edit().putString(KEY_TOKEN, token).apply();
  }

  public static String resolveTokenOrEmpty(Context context) {
    if (context == null) return "";
    String token = prefs(context).getString(KEY_TOKEN, "");
    return token != null ? token.trim() : "";
  }

  /** Clears only when the pending token is the one just bound (a newer rotation is kept). */
  public static void clearIfEquals(Context context, String boundToken) {
    if (context == null || boundToken == null) return;
    if (boundToken.trim().equals(resolveTokenOrEmpty(context))) clear(context);
  }

  public static void clear(Context context) {
    if (context == null) return;
    prefs(context).edit().clear().apply();
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
