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
 * <p>Contract (aligned with iOS {@code DibayMemberEventEligibilityStore}):
 * eligible=true REQUIRES non-empty bound member user id in the same durable write.
 * eligible=true with empty bound is refused without clearing existing presentable (Wave-1 M1).
 * eligible=false (logout/guest) clears both.
 *
 * <p>Global auth authority remains web/session ({@code dibay-session-manager}).
 */
public final class DibayCallAuthEligibilityStore {
  private static final String TAG = "DIBAY_CALL_AUTH";
  private static final String PREFS = "dibay_call_auth_eligibility";
  private static final String KEY_ELIGIBLE = "member_call_eligible";
  private static final String KEY_BOUND_USER_ID = "bound_member_user_id";

  private DibayCallAuthEligibilityStore() {}

  public static final class WriteResult {
    public final boolean eligible;
    public final boolean boundUserSet;

    private WriteResult(boolean eligible, boolean boundUserSet) {
      this.eligible = eligible;
      this.boundUserSet = boundUserSet;
    }
  }

  /**
   * Atomic durable write — sole mutation entry for call presentation eligibility.
   *
   * @return applied eligible flag and whether bound was set
   */
  public static WriteResult setMemberCallEligibility(
      Context context, boolean eligible, String boundUserId, String reason) {
    if (context == null) {
      return new WriteResult(false, false);
    }
    String safeReason =
        reason != null && !reason.trim().isEmpty() ? reason.trim() : "unspecified";
    String bound = boundUserId != null ? boundUserId.trim() : "";

    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);

    if (eligible && bound.isEmpty()) {
      // Wave-1 M1: refuse illegal eligible-without-bound WITHOUT clearing existing presentable.
      // Guest/logout CLEAR remains the !eligible branch below.
      boolean currentEligible = prefs.getBoolean(KEY_ELIGIBLE, false);
      String currentBound = getBoundMemberUserId(context);
      boolean presentable = currentEligible && !currentBound.isEmpty();
      Log.i(
          TAG,
          "member_call_eligible_set skipped_no_clear reason="
              + safeReason
              + ":eligible_requires_bound_user presentable="
              + presentable);
      return new WriteResult(presentable, !currentBound.isEmpty());
    }

    if (!eligible) {
      prefs.edit().putBoolean(KEY_ELIGIBLE, false).remove(KEY_BOUND_USER_ID).apply();
      Log.i(TAG, "member_call_eligible_set eligible=false reason=" + safeReason);
      Log.i(TAG, "bound_member_user_set has_user=false reason=" + safeReason);
      return new WriteResult(false, false);
    }

    prefs.edit().putBoolean(KEY_ELIGIBLE, true).putString(KEY_BOUND_USER_ID, bound).apply();
    Log.i(TAG, "member_call_eligible_set eligible=true reason=" + safeReason);
    Log.i(TAG, "bound_member_user_set has_user=true reason=" + safeReason);
    return new WriteResult(true, true);
  }

  /**
   * @deprecated Prefer {@link #setMemberCallEligibility}. Clears bound when ineligible; eligible-only
   *     writes coerce using current bound (may fail-closed).
   */
  public static void setEligible(Context context, boolean eligible, String reason) {
    if (!eligible) {
      setMemberCallEligibility(context, false, null, reason);
      return;
    }
    setMemberCallEligibility(
        context,
        true,
        getBoundMemberUserId(context),
        (reason != null ? reason : "unspecified") + ":setEligible_requires_existing_bound");
  }

  public static void setBoundMemberUserId(Context context, String userId, String reason) {
    String id = userId != null ? userId.trim() : "";
    String safeReason = reason != null ? reason : "unspecified";
    if (id.isEmpty()) {
      setMemberCallEligibility(context, false, null, safeReason + ":bound_cleared");
      return;
    }
    SharedPreferences prefs =
        context == null
            ? null
            : context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    boolean eligibleFlag = prefs != null && prefs.getBoolean(KEY_ELIGIBLE, false);
    if (eligibleFlag) {
      setMemberCallEligibility(context, true, id, safeReason);
      return;
    }
    // Bound-only update while ineligible — do not enable presentation.
    if (context == null) return;
    prefs.edit().putString(KEY_BOUND_USER_ID, id).apply();
    Log.i(
        TAG,
        "bound_member_user_set has_user=true reason=" + safeReason + " eligible=false");
  }

  public static String getBoundMemberUserId(Context context) {
    if (context == null) return "";
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String id = prefs.getString(KEY_BOUND_USER_ID, "");
    return id != null ? id.trim() : "";
  }

  /** Presentable: eligible flag ∧ non-empty bound (fail-closed). */
  public static boolean isMemberCallEligible(Context context) {
    if (context == null) return false;
    healIllegalDurableStateIfNeeded(context);
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    return prefs.getBoolean(KEY_ELIGIBLE, false) && !getBoundMemberUserId(context).isEmpty();
  }

  /** Clear legacy durable corruption: eligible=true with empty bound. */
  public static void healIllegalDurableStateIfNeeded(Context context) {
    if (context == null) return;
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    boolean eligibleFlag = prefs.getBoolean(KEY_ELIGIBLE, false);
    String bound = getBoundMemberUserId(context);
    if (eligibleFlag && bound.isEmpty()) {
      setMemberCallEligibility(context, false, null, "heal_eligible_without_bound");
    }
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
    if (context == null) {
      return PresentDecision.drop("member_event_ineligible");
    }
    healIllegalDurableStateIfNeeded(context);
    SharedPreferences prefs =
        context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(KEY_ELIGIBLE, false)) {
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
