package com.dibay.app.nativevideo;

import java.util.concurrent.ConcurrentHashMap;

/** Native Video single owner. Web/V4 may not claim calls owned here. */
public final class NativeVideoCallOwner {
  private static final ConcurrentHashMap<String, String> OWNERS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> TERMINAL = new ConcurrentHashMap<>();

  private NativeVideoCallOwner() {}

  public static boolean claimNative(String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    if (TERMINAL.containsKey(sid)) {
      NativeVideoCallLog.warn("duplicate_runtime_blocked", sid, "reason=terminal_call_replay");
      return false;
    }
    String prev = OWNERS.putIfAbsent(sid, "native_video");
    if (prev == null) {
      NativeVideoCallLog.info("owner_claimed_native_video", sid, "reason=" + safe(reason));
      return true;
    }
    NativeVideoCallLog.warn("duplicate_runtime_blocked", sid, "reason=already_owned_native_video");
    return false;
  }

  public static boolean isNativeOwned(String callId) {
    return callId != null && "native_video".equals(OWNERS.get(callId.trim()));
  }

  public static void release(String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String prev = OWNERS.remove(sid);
    TERMINAL.put(sid, Boolean.TRUE);
    NativeVideoCallLog.info("owner_released", sid, "owner=" + prev + " reason=" + safe(reason));
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
