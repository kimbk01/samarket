package com.dibay.app;

/** Native incoming call session phases — audio/video share the same lifecycle. */
public enum IncomingCallSessionPhase {
  RECEIVED,
  ROUTED,
  RINGING,
  PRESENTED,
  ACCEPTING,
  ACCEPTED,
  REJECTING,
  REJECTED,
  MISSED,
  CANCELLED_BY_CALLER,
  ENDED,
  CLEANED;

  public String wire() {
    return name().toLowerCase();
  }

  public boolean isTerminal() {
    return this == REJECTED
        || this == MISSED
        || this == CANCELLED_BY_CALLER
        || this == ENDED
        || this == CLEANED
        || this == ACCEPTED;
  }

  public boolean blocksMissedTimeout() {
    return ordinal() >= ACCEPTING.ordinal();
  }

  public boolean blocksIncomingUiRepresent() {
    return ordinal() >= ACCEPTING.ordinal();
  }

  public boolean blocksStaleCleanup() {
    return ordinal() >= RINGING.ordinal() && !isTerminal();
  }
}
