package com.dibay.app;

import android.util.Log;
import com.dibay.app.callv4.CallV4Lane;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** V4 non-foreground incoming visible-surface owner — one full visual per callId. */
public final class IncomingCallSurfaceOwner {
  public enum VisibleOwner {
    NATIVE_FSI,
    NOTIFICATION_FALLBACK,
    NOTIFICATION_ACTION_ONLY,
    FGS_NOTIFICATION
  }

  private static final ConcurrentHashMap<String, VisibleOwner> ACTIVE_BY_CALL_ID = new ConcurrentHashMap<>();

  private IncomingCallSurfaceOwner() {}

  public static boolean tryClaimVisibleOwner(String callId, VisibleOwner owner) {
    if (callId == null || callId.trim().isEmpty() || owner == null) return false;
    String sid = callId.trim();
    VisibleOwner prev = ACTIVE_BY_CALL_ID.putIfAbsent(sid, owner);
    if (prev == null) return true;
    if (prev == owner) return true;
    if (isFullVisualOwner(prev) && isFullVisualOwner(owner)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_surface_duplicate_blocked callId="
              + sid
              + " owner="
              + owner.name().toLowerCase()
              + " existing="
              + prev.name().toLowerCase());
      return false;
    }
    ACTIVE_BY_CALL_ID.put(sid, owner);
    return true;
  }

  public static void clear(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    ACTIVE_BY_CALL_ID.remove(callId.trim());
  }

  public static VisibleOwner getVisibleOwner(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return ACTIVE_BY_CALL_ID.get(callId.trim());
  }

  public static boolean isNativeFsiOwner(String callId) {
    return getVisibleOwner(callId) == VisibleOwner.NATIVE_FSI;
  }

  public static boolean isNotificationFallbackOwner(String callId) {
    return getVisibleOwner(callId) == VisibleOwner.NOTIFICATION_FALLBACK;
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

  static String resolveVisibility(android.content.Context context) {
    if (DibayKeyguardHelper.isKeyguardLocked(context)) return "locked";
    return "background";
  }
}
