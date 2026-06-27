package com.dibay.app.nativecall;

import android.util.Log;
import java.util.concurrent.ConcurrentHashMap;

/** Common visible-surface owner for Native Call Runtime. Voice/Video differ only in media. */
public final class NativeCallVisibleSurfaceOwner {
  public static final String TAG = "DIBAY_NATIVE_CALL";
  private static final String PREFIX = "[DIBAY_NATIVE_CALL] ";
  private static final ConcurrentHashMap<String, Surface> SURFACES = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> NOTIFICATION_VISUAL_SUPPRESSED =
      new ConcurrentHashMap<>();

  private static final class Surface {
    final String mediaType;
    volatile String state;

    Surface(String mediaType, String state) {
      this.mediaType = safe(mediaType);
      this.state = safe(state);
    }
  }

  private NativeCallVisibleSurfaceOwner() {}

  public static void logCallOwnerClaimed(String callId, String mediaType, String reason) {
    info("owner_claimed_native_call", callId, "mediaType=" + safe(mediaType) + " reason=" + safe(reason));
  }

  public static boolean claim(String callId, String mediaType, String state) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return false;
    Surface next = new Surface(mediaType, state);
    Surface prev = SURFACES.putIfAbsent(sid, next);
    if (prev == null) {
      info("visible_surface_owner_claimed", sid, "mediaType=" + next.mediaType + " state=" + next.state);
      return true;
    }
    warn(
        "visible_surface_duplicate_blocked",
        sid,
        "existingMediaType=" + prev.mediaType + " existingState=" + prev.state + " requestedState=" + safe(state));
    return false;
  }

  public static boolean isClaimed(String callId) {
    return SURFACES.containsKey(normalize(callId));
  }

  public static void markConnected(String callId, String mediaType) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return;
    Surface surface = SURFACES.get(sid);
    if (surface == null) {
      surface = new Surface(mediaType, "connected");
      Surface prev = SURFACES.putIfAbsent(sid, surface);
      if (prev == null) {
        info("visible_surface_owner_claimed", sid, "mediaType=" + surface.mediaType + " state=connected_recovered");
      } else {
        surface = prev;
      }
    }
    surface.state = "connected";
    info("incoming_surface_closed_on_connected", sid, "mediaType=" + safe(mediaType));
    info("connected_surface_shown", sid, "mediaType=" + safe(mediaType));
  }

  public static void logNotificationVisualSuppressedConnected(String callId, String mediaType) {
    info("notification_visual_suppressed_connected", callId, "mediaType=" + safe(mediaType));
  }

  public static void logNotificationVisualSuppressed(String callId, String mediaType) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return;
    if (NOTIFICATION_VISUAL_SUPPRESSED.putIfAbsent(sid, Boolean.TRUE) == null) {
      info("notification_visual_suppressed", sid, "mediaType=" + safe(mediaType));
    }
  }

  public static void release(String callId, String reason) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return;
    Surface removed = SURFACES.remove(sid);
    NOTIFICATION_VISUAL_SUPPRESSED.remove(sid);
    if (removed != null) {
      info(
          "visible_surface_released",
          sid,
          "mediaType=" + removed.mediaType + " state=" + removed.state + " reason=" + safe(reason));
    }
  }

  private static void info(String marker, String callId, String details) {
    Log.i(TAG, format(marker, callId, details));
  }

  private static void warn(String marker, String callId, String details) {
    Log.w(TAG, format(marker, callId, details));
  }

  private static String format(String marker, String callId, String details) {
    String extra = details != null && !details.trim().isEmpty() ? " " + details.trim() : "";
    return PREFIX + marker + " callId=" + normalize(callId, "unknown") + extra;
  }

  private static String normalize(String callId) {
    return normalize(callId, "");
  }

  private static String normalize(String callId, String fallback) {
    return callId != null && !callId.trim().isEmpty() ? callId.trim() : fallback;
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
