package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.Map;

/**
 * Local member private-event eligibility — AUTH SESSION PROJECTION, not global auth SSOT.
 *
 * <p>Gates: incoming call UI + chat/generic tray notifications + tap/deeplink.
 * AUTHENTICATED → eligible + bound user id; LOGGED_OUT / TERMINAL_GUEST / logout-pending →
 * ineligible (fail-closed: missing key means ineligible).
 *
 * <p>Global auth authority remains web/session ({@code dibay-session-manager}).
 */
public final class DibayCallAuthEligibilityStore {
  private static final String TAG = "DIBAY_CALL_AUTH";
  private static final String PREFS = "dibay_call_auth_eligibility";
  private static final String KEY_ELIGIBLE = "member_call_eligible";
  private static final String KEY_BOUND_USER_ID = "bound_member_user_id";

  private DibayCallAuthEligibilityStore() {}

  public static void setEligible(Context context, boolean eligible, String reason) {
    if (context == null) return;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    SharedPreferences.Editor editor = prefs.edit().putBoolean(KEY_ELIGIBLE, eligible);
    if (!eligible) {
      editor.remove(KEY_BOUND_USER_ID);
    }
    editor.apply();
    Log.i(
        TAG,
        "member_call_eligible_set eligible="
            + eligible
            + " reason="
            + (reason != null ? reason : "unspecified"));
  }

  public static void setBoundMemberUserId(Context context, String userId, String reason) {
    if (context == null) return;
    String id = userId != null ? userId.trim() : "";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    SharedPreferences.Editor editor = prefs.edit();
    if (id.isEmpty()) {
      editor.remove(KEY_BOUND_USER_ID);
    } else {
      editor.putString(KEY_BOUND_USER_ID, id);
    }
    editor.apply();
    Log.i(
        TAG,
        "bound_member_user_set has_user="
            + (!id.isEmpty())
            + " reason="
            + (reason != null ? reason : "unspecified"));
  }

  public static String getBoundMemberUserId(Context context) {
    if (context == null) return "";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String id = prefs.getString(KEY_BOUND_USER_ID, "");
    return id != null ? id.trim() : "";
  }

  /** Fail-closed: never-set or false → ineligible. */
  public static boolean isMemberCallEligible(Context context) {
    if (context == null) return false;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    return prefs.getBoolean(KEY_ELIGIBLE, false);
  }

  /**
   * Authenticated private notification/call presentation gate.
   * Mirrors {@code lib/push/native/can-present-authenticated-notification.ts}.
   */
  public static boolean canPresentAuthenticatedNotification(
      Context context, String payloadRecipientUserId) {
    return presentDecision(context, payloadRecipientUserId).ok;
  }

  public static PresentDecision presentDecision(Context context, String payloadRecipientUserId) {
    if (!isMemberCallEligible(context)) {
      return PresentDecision.drop("member_event_ineligible");
    }
    String bound = getBoundMemberUserId(context);
    if (bound.isEmpty()) {
      return PresentDecision.drop("bound_user_missing");
    }
    String recipient = payloadRecipientUserId != null ? payloadRecipientUserId.trim() : "";
    if (!recipient.isEmpty() && !recipient.equals(bound)) {
      return PresentDecision.drop("recipient_user_mismatch");
    }
    return PresentDecision.present();
  }

  public static String resolvePayloadRecipientUserId(Map<String, String> data) {
    if (data == null) return "";
    String[] keys =
        new String[] {
          "recipientMemberId",
          "recipient_member_id",
          "targetUserId",
          "target_user_id",
          "userId",
          "user_id",
          "recipientUserId",
          "recipient_user_id"
        };
    for (String key : keys) {
      String v = data.get(key);
      if (v != null) {
        String t = v.trim();
        if (!t.isEmpty()) return t;
      }
    }
    return "";
  }

  public static final class PresentDecision {
    public final boolean ok;
    public final String reason;

    private PresentDecision(boolean ok, String reason) {
      this.ok = ok;
      this.reason = reason;
    }

    static PresentDecision present() {
      return new PresentDecision(true, "present");
    }

    static PresentDecision drop(String reason) {
      return new PresentDecision(false, reason);
    }
  }
}
