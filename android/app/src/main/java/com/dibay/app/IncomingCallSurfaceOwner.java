package com.dibay.app;

import android.content.Context;
import android.util.Log;
import com.dibay.app.callv4.CallV4Lane;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * V4 callId-scoped incoming visible-surface owner — atomic SSOT.
 *
 * <p>One full incoming UI per callId. FGS notification is never a visible owner (carrier-only).
 */
public final class IncomingCallSurfaceOwner {
  public enum SurfaceOwner {
    NATIVE_FSI,
    NATIVE_ACTIVITY,
    WEB_IN_APP,
    NOTIFICATION_FALLBACK,
    NOTIFICATION_ACTION_ONLY,
    ACCEPTED_TRANSITION,
    CONNECTED,
    TERMINAL
  }

  private static final ConcurrentHashMap<String, SurfaceOwner> ACTIVE_BY_CALL_ID = new ConcurrentHashMap<>();

  private IncomingCallSurfaceOwner() {}

  /** @deprecated use {@link SurfaceOwner} */
  public enum VisibleOwner {
    NATIVE_FSI,
    NOTIFICATION_FALLBACK,
    NOTIFICATION_ACTION_ONLY,
    FGS_NOTIFICATION
  }

  public static SurfaceOwner resolveInitialOwner(Context context, boolean foregroundUnlockedInteractive) {
    if (foregroundUnlockedInteractive) return SurfaceOwner.WEB_IN_APP;
    if (DibayKeyguardHelper.isKeyguardLocked(context) || !DibayKeyguardHelper.isInteractive(context)) {
      return SurfaceOwner.NATIVE_FSI;
    }
    return SurfaceOwner.NATIVE_ACTIVITY;
  }

  static String resolveVisibility(Context context) {
    if (context == null) return "background";
    if (DibayKeyguardHelper.isKeyguardLocked(context)) return "locked";
    if (!DibayKeyguardHelper.isInteractive(context)) return "background";
    if (MainActivity.isAppVisibleForIncomingCall()) return "foreground";
    return "background";
  }

  /** Claim owner at FCM boundary — before any visible surface starts. */
  public static boolean tryClaimIncomingOwner(
      Context context, String callId, SurfaceOwner owner, String reason) {
    if (callId == null || callId.trim().isEmpty() || owner == null) return false;
    String sid = callId.trim();
    SurfaceOwner prev = ACTIVE_BY_CALL_ID.putIfAbsent(sid, owner);
    if (prev == null) {
      logOwnerDecided(sid, owner, resolveVisibility(context != null ? context : null), reason);
      notifyWebSurfaceOwner(context, sid, owner, reason);
      return true;
    }
    if (prev == owner) return true;
    if (shouldBlockVisibleIncomingStart(sid, owner)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_surface_duplicate_blocked callId="
              + sid
              + " owner="
              + owner.name().toLowerCase()
              + " existing="
              + prev.name().toLowerCase()
              + " reason="
              + (reason != null ? reason : "claim"));
      return false;
    }
    ACTIVE_BY_CALL_ID.put(sid, owner);
    logOwnerDecided(sid, owner, resolveVisibility(context != null ? context : null), reason);
    IncomingCallBackgroundNotifier.logLockscreenEvent(
        context,
        sid,
        "owner_replaced",
        owner,
        context != null ? IncomingCallNotificationBuilder.canPostFullScreenIntent(context) : null,
        "from=" + (prev != null ? prev.name().toLowerCase() : "none")
            + " reason=" + (reason != null ? reason : "transition"));
    notifyWebSurfaceOwner(context, sid, owner, reason);
    return true;
  }

  public static boolean transitionIncomingOwner(
      Context context, String callId, SurfaceOwner owner, String reason) {
    if (callId == null || callId.trim().isEmpty() || owner == null) return false;
    String sid = callId.trim();
    SurfaceOwner prev = ACTIVE_BY_CALL_ID.get(sid);
    if (prev == owner) {
      notifyWebSurfaceOwner(context, sid, owner, reason);
      return true;
    }
    if (prev != null && isTerminalLikeOwner(prev) && !isTerminalLikeOwner(owner)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_owner_transition_blocked callId="
              + sid
              + " from="
              + prev.name().toLowerCase()
              + " to="
              + owner.name().toLowerCase());
      return false;
    }
    ACTIVE_BY_CALL_ID.put(sid, owner);
    logOwnerDecided(sid, owner, resolveVisibility(context != null ? context : null), reason);
    notifyWebSurfaceOwner(context, sid, owner, reason);
    return true;
  }

  public static boolean shouldBlockVisibleIncomingStart(String callId, SurfaceOwner proposed) {
    if (callId == null || proposed == null) return true;
    String sid = callId.trim();
    if (sid.isEmpty()) return true;
    SurfaceOwner current = ACTIVE_BY_CALL_ID.get(sid);
    if (current == null) return false;
    if (!isExclusiveIncomingOwner(current)) return false;
    if (!isFullVisualIncoming(proposed)) return false;
    if (current == proposed) return false;
    return true;
  }

  public static void clearOwner(Context context, String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    SurfaceOwner prev = ACTIVE_BY_CALL_ID.remove(sid);
    if (prev == null) return;
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] incoming_owner_cleared callId="
            + sid
            + " prev="
            + prev.name().toLowerCase()
            + " reason="
            + (reason != null ? reason : "clear"));
    IncomingCallBackgroundNotifier.logLockscreenEvent(
        context,
        sid,
        "owner_released",
        SurfaceOwner.TERMINAL,
        context != null ? IncomingCallNotificationBuilder.canPostFullScreenIntent(context) : null,
        "prev=" + prev.name().toLowerCase() + " reason=" + (reason != null ? reason : "clear"));
    notifyWebSurfaceOwner(context, sid, SurfaceOwner.TERMINAL, reason != null ? reason : "clear");
  }

  public static SurfaceOwner getSurfaceOwner(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return ACTIVE_BY_CALL_ID.get(callId.trim());
  }

  /** @deprecated use {@link #getSurfaceOwner} */
  public static VisibleOwner getVisibleOwner(String callId) {
    SurfaceOwner owner = getSurfaceOwner(callId);
    if (owner == null) return null;
    switch (owner) {
      case NATIVE_FSI:
      case NATIVE_ACTIVITY:
      case ACCEPTED_TRANSITION:
        return VisibleOwner.NATIVE_FSI;
      case NOTIFICATION_FALLBACK:
        return VisibleOwner.NOTIFICATION_FALLBACK;
      case NOTIFICATION_ACTION_ONLY:
        return VisibleOwner.NOTIFICATION_ACTION_ONLY;
      default:
        return null;
    }
  }

  public static boolean tryClaimVisibleOwner(String callId, VisibleOwner owner) {
    if (owner == null) return false;
    SurfaceOwner mapped;
    switch (owner) {
      case NATIVE_FSI:
        mapped = SurfaceOwner.NATIVE_FSI;
        break;
      case NOTIFICATION_FALLBACK:
        mapped = SurfaceOwner.NOTIFICATION_FALLBACK;
        break;
      case NOTIFICATION_ACTION_ONLY:
        mapped = SurfaceOwner.NOTIFICATION_ACTION_ONLY;
        break;
      case FGS_NOTIFICATION:
        return true;
      default:
        return false;
    }
    return tryClaimIncomingOwner(null, callId, mapped, "legacy_visible_owner");
  }

  public static boolean isNativeFsiOwner(String callId) {
    SurfaceOwner owner = getSurfaceOwner(callId);
    return owner == SurfaceOwner.NATIVE_FSI || owner == SurfaceOwner.NATIVE_ACTIVITY;
  }

  /** True only when FSI notification bridge owns visible UI — not Activity-first lock. */
  public static boolean isStrictNativeFsiOwner(String callId) {
    return getSurfaceOwner(callId) == SurfaceOwner.NATIVE_FSI;
  }

  public static boolean isNativeIncomingOwner(String callId) {
    SurfaceOwner owner = getSurfaceOwner(callId);
    return owner == SurfaceOwner.NATIVE_FSI
        || owner == SurfaceOwner.NATIVE_ACTIVITY
        || owner == SurfaceOwner.NOTIFICATION_FALLBACK;
  }

  public static boolean isWebInAppOwner(String callId) {
    return getSurfaceOwner(callId) == SurfaceOwner.WEB_IN_APP;
  }

  public static boolean isAcceptedTransitionOwner(String callId) {
    return getSurfaceOwner(callId) == SurfaceOwner.ACCEPTED_TRANSITION;
  }

  public static boolean isNotificationFallbackOwner(String callId) {
    return getSurfaceOwner(callId) == SurfaceOwner.NOTIFICATION_FALLBACK;
  }

  public static void clear(String callId) {
    clearOwner(null, callId, "legacy_clear");
  }

  static boolean isFullVisualOwner(VisibleOwner owner) {
    return owner == VisibleOwner.NATIVE_FSI
        || owner == VisibleOwner.NOTIFICATION_FALLBACK
        || owner == VisibleOwner.FGS_NOTIFICATION;
  }

  static void logOwnerDecided(String callId, String owner, String visibility, String reason) {
    StringBuilder message =
        new StringBuilder("[DIBAY_CALL_V4] incoming_owner_decided callId=")
            .append(callId)
            .append(" owner=")
            .append(owner)
            .append(" visibility=")
            .append(visibility);
    if (reason != null && !reason.trim().isEmpty()) {
      message.append(" reason=").append(reason.trim());
    }
    Log.i(CallV4Lane.TAG, message.toString());
  }

  private static void logOwnerDecided(
      String callId, SurfaceOwner owner, String visibility, String reason) {
    logOwnerDecided(callId, owner.name().toLowerCase(), visibility, reason);
  }

  private static boolean isExclusiveIncomingOwner(SurfaceOwner owner) {
    return owner == SurfaceOwner.NATIVE_FSI
        || owner == SurfaceOwner.NATIVE_ACTIVITY
        || owner == SurfaceOwner.WEB_IN_APP
        || owner == SurfaceOwner.NOTIFICATION_FALLBACK
        || owner == SurfaceOwner.ACCEPTED_TRANSITION;
  }

  private static boolean isFullVisualIncoming(SurfaceOwner owner) {
    return owner == SurfaceOwner.NATIVE_FSI
        || owner == SurfaceOwner.NATIVE_ACTIVITY
        || owner == SurfaceOwner.WEB_IN_APP
        || owner == SurfaceOwner.NOTIFICATION_FALLBACK;
  }

  private static boolean isTerminalLikeOwner(SurfaceOwner owner) {
    return owner == SurfaceOwner.TERMINAL || owner == SurfaceOwner.CONNECTED;
  }

  private static void notifyWebSurfaceOwner(
      Context context, String callId, SurfaceOwner owner, String reason) {
    if (context == null || !CallV4Lane.isTelegramLaneEnabled(context)) return;
    MainActivity.deliverCallSurfaceOwnerEvent(
        context, callId, owner.name().toLowerCase(), reason != null ? reason : "native");
  }
}
