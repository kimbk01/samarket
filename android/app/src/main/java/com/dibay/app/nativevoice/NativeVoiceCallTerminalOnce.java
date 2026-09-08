package com.dibay.app.nativevoice;

import com.dibay.app.nativecall.NativeCallTerminalLifecycle;

/**
 * Voice facade over {@link NativeCallTerminalLifecycle}.
 *
 * <p>CONTRACT: IN_PROGRESS ≠ COMPLETED. Do not treat begin as cleaned.
 */
final class NativeVoiceCallTerminalOnce {
  private NativeVoiceCallTerminalOnce() {}

  static NativeCallTerminalLifecycle.Phase phase(String callId) {
    return NativeCallTerminalLifecycle.phase(callId);
  }

  static boolean tryBegin(String callId) {
    return NativeCallTerminalLifecycle.tryBegin(callId);
  }

  static void markCompleted(String callId) {
    NativeCallTerminalLifecycle.markCompleted(callId);
  }

  static boolean isInProgress(String callId) {
    return NativeCallTerminalLifecycle.isInProgress(callId);
  }

  static boolean isCompleted(String callId) {
    return NativeCallTerminalLifecycle.isCompleted(callId);
  }

  /** @deprecated Prefer {@link #isCompleted(String)} — historically meant claim-or-done. */
  static boolean isClaimed(String callId) {
    return isCompleted(callId) || isInProgress(callId);
  }

  static void clearForTests() {
    NativeCallTerminalLifecycle.clearForTests();
  }
}
