package com.dibay.app.nativevideo;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Once-guard for Native Video terminal cleanup (voice {@code NativeVoiceCallTerminalOnce} parity).
 *
 * <p>CONTRACT: {@code State.ENDING} is a transition, not cleanup-complete. Remote FCM / Agora must
 * still be allowed to run cleanup until this claim succeeds.
 */
final class NativeVideoCallTerminalOnce {
  private static final ConcurrentHashMap<String, Boolean> CLAIMED = new ConcurrentHashMap<>();

  private NativeVideoCallTerminalOnce() {}

  static boolean claim(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    return CLAIMED.putIfAbsent(callId.trim(), Boolean.TRUE) == null;
  }

  static boolean isClaimed(String callId) {
    return callId != null && CLAIMED.containsKey(callId.trim());
  }

  static void clearForTests() {
    CLAIMED.clear();
  }
}
