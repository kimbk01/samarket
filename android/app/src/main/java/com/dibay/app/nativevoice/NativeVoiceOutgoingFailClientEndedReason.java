package com.dibay.app.nativevoice;

/**
 * E-C2-B Phase A — Android Voice <b>outgoing</b> {@code fail(reason)} → server {@code
 * clientEndedReason} (TRUSTED allowlist only).
 *
 * <p>Only maps when the native reason string has a code-proven correspondence to an existing
 * TRUSTED token ({@code call-terminal-reason-authority} / {@code
 * messenger-call-join-failure-reason.ts}). Unmapped reasons return null → legacy {@code action=end}
 * without {@code clientEndedReason} (no invented failed_*).
 */
final class NativeVoiceOutgoingFailClientEndedReason {
  private NativeVoiceOutgoingFailClientEndedReason() {}

  /**
   * @return TRUSTED wire token, or {@code null} to keep legacy end-without-reason
   */
  static String mapIfTrusted(String reason) {
    if (reason == null) return null;
    String r = reason.trim().toLowerCase();
    if (r.isEmpty()) return null;
    // Proven: classifyMessengerCallJoinFailure — token|… → failed_signaling (TRUSTED).
    // Native Voice outgoing emits "token_fetch_failed …" on token GET failure.
    if (r.startsWith("token_fetch_failed")) {
      return "failed_signaling";
    }
    // Agora / join_return / engine_busy / unsupported_media — NOT mapped (Owner: no guess).
    return null;
  }
}
