package com.dibay.app.nativevoice;

import java.util.concurrent.ConcurrentHashMap;

/** Per-call owner lock between Native Voice Runtime and V4 Web fallback. */
public final class NativeVoiceCallOwner {
  private static final ConcurrentHashMap<String, String> OWNERS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> TERMINAL_CALLS = new ConcurrentHashMap<>();

  private NativeVoiceCallOwner() {}

  public static boolean claimNative(String callId, String reason) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return false;
    if (TERMINAL_CALLS.containsKey(sid)) {
      NativeVoiceCallLog.warn("duplicate_runtime_blocked", sid, "reason=terminal_call_replay");
      return false;
    }
    String prev = OWNERS.putIfAbsent(sid, "native_voice");
    if (prev == null) {
      NativeVoiceCallLog.info("owner_claimed_native_voice", sid, "reason=" + safe(reason));
      return true;
    }
    if ("native_voice".equals(prev)) {
      NativeVoiceCallLog.warn(
          "duplicate_runtime_blocked",
          sid,
          "reason=already_owned_native_voice existingOwner=native_voice requested=native_voice");
      return false;
    }
    NativeVoiceCallLog.warn(
        "duplicate_runtime_blocked", sid, "existingOwner=" + prev + " requested=native_voice");
    return false;
  }

  public static boolean claimWebV4(String callId, String reason) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return false;
    String prev = OWNERS.putIfAbsent(sid, "web_v4");
    if (prev == null || "web_v4".equals(prev)) return true;
    NativeVoiceCallLog.warn("duplicate_runtime_blocked", sid, "existingOwner=" + prev + " requested=web_v4");
    return false;
  }

  public static boolean isNativeOwned(String callId) {
    return "native_voice".equals(OWNERS.get(normalize(callId)));
  }

  public static void release(String callId, String reason) {
    String sid = normalize(callId);
    if (sid.isEmpty()) return;
    String prev = OWNERS.remove(sid);
    if (prev != null) {
      TERMINAL_CALLS.put(sid, Boolean.TRUE);
      NativeVoiceCallLog.info("owner_released", sid, "owner=" + prev + " reason=" + safe(reason));
    }
  }

  private static String normalize(String callId) {
    return callId != null ? callId.trim() : "";
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
