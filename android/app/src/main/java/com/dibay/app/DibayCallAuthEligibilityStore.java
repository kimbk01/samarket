package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Local member incoming-call eligibility — AUTH SESSION PROJECTION, not global auth SSOT.
 *
 * <p>AUTHENTICATED → eligible; LOGGED_OUT / TERMINAL_GUEST → ineligible.
 * Fail-closed: missing key means ineligible (guest must never present member call UI).
 *
 * <p>Global auth authority remains web/session ({@code dibay-session-manager}). This store only
 * gates native incoming call UI after FCM delivery.
 */
public final class DibayCallAuthEligibilityStore {
  private static final String TAG = "DIBAY_CALL_AUTH";
  private static final String PREFS = "dibay_call_auth_eligibility";
  private static final String KEY_ELIGIBLE = "member_call_eligible";

  private DibayCallAuthEligibilityStore() {}

  public static void setEligible(Context context, boolean eligible, String reason) {
    if (context == null) return;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs.edit().putBoolean(KEY_ELIGIBLE, eligible).apply();
    Log.i(
        TAG,
        "member_call_eligible_set eligible="
            + eligible
            + " reason="
            + (reason != null ? reason : "unspecified"));
  }

  /** Fail-closed: never-set or false → ineligible. */
  public static boolean isMemberCallEligible(Context context) {
    if (context == null) return false;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    return prefs.getBoolean(KEY_ELIGIBLE, false);
  }
}
