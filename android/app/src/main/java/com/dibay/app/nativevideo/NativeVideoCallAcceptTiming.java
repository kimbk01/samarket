package com.dibay.app.nativevideo;

import android.os.SystemClock;
import java.util.concurrent.ConcurrentHashMap;

/** Accept→first-frame timing marks for callee incoming QA (elapsedRealtime ms). */
final class NativeVideoCallAcceptTiming {
  private static final ConcurrentHashMap<String, Long> ACCEPT_TAPPED_ELAPSED_MS =
      new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Long> JOIN_SUCCESS_ELAPSED_MS =
      new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Long> SURFACE_ATTACHED_ELAPSED_MS =
      new ConcurrentHashMap<>();

  private NativeVideoCallAcceptTiming() {}

  static void markAcceptTapped(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    ACCEPT_TAPPED_ELAPSED_MS.put(sid, SystemClock.elapsedRealtime());
    JOIN_SUCCESS_ELAPSED_MS.remove(sid);
    SURFACE_ATTACHED_ELAPSED_MS.remove(sid);
  }

  static void markJoinSuccess(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    JOIN_SUCCESS_ELAPSED_MS.put(callId.trim(), SystemClock.elapsedRealtime());
  }

  static void markSurfaceAttached(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    SURFACE_ATTACHED_ELAPSED_MS.put(callId.trim(), SystemClock.elapsedRealtime());
  }

  static void clear(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    ACCEPT_TAPPED_ELAPSED_MS.remove(sid);
    JOIN_SUCCESS_ELAPSED_MS.remove(sid);
    SURFACE_ATTACHED_ELAPSED_MS.remove(sid);
  }

  static long elapsedFromAcceptMs(String callId) {
    Long acceptAt = acceptAt(callId);
    if (acceptAt == null) return -1L;
    return Math.max(0L, SystemClock.elapsedRealtime() - acceptAt);
  }

  static long elapsedFromJoinMs(String callId) {
    Long joinAt = joinAt(callId);
    if (joinAt == null) return -1L;
    return Math.max(0L, SystemClock.elapsedRealtime() - joinAt);
  }

  static long elapsedFromSurfaceAttachMs(String callId) {
    Long surfaceAt = surfaceAt(callId);
    if (surfaceAt == null) return -1L;
    return Math.max(0L, SystemClock.elapsedRealtime() - surfaceAt);
  }

  private static Long acceptAt(String callId) {
    if (callId == null) return null;
    return ACCEPT_TAPPED_ELAPSED_MS.get(callId.trim());
  }

  private static Long joinAt(String callId) {
    if (callId == null) return null;
    return JOIN_SUCCESS_ELAPSED_MS.get(callId.trim());
  }

  private static Long surfaceAt(String callId) {
    if (callId == null) return null;
    return SURFACE_ATTACHED_ELAPSED_MS.get(callId.trim());
  }
}
