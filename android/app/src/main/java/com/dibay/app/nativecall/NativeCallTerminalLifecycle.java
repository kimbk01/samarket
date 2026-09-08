package com.dibay.app.nativecall;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Single terminal-cleanup lifecycle authority for Voice/Video Native Runtimes.
 *
 * <p>CONTRACT: {@code IN_PROGRESS} is not {@code COMPLETED}. Claiming/starting cleanup must never
 * be logged or treated as already cleaned.
 */
public final class NativeCallTerminalLifecycle {
  public enum Phase {
    NOT_STARTED,
    IN_PROGRESS,
    COMPLETED
  }

  private static final class Entry {
    volatile Phase phase = Phase.NOT_STARTED;
  }

  private static final ConcurrentHashMap<String, Entry> STATES = new ConcurrentHashMap<>();

  private NativeCallTerminalLifecycle() {}

  public static Phase phase(String callId) {
    if (callId == null || callId.trim().isEmpty()) return Phase.NOT_STARTED;
    Entry entry = STATES.get(callId.trim());
    return entry == null ? Phase.NOT_STARTED : entry.phase;
  }

  /** First terminal only: NOT_STARTED → IN_PROGRESS. */
  public static boolean tryBegin(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    Entry entry = STATES.computeIfAbsent(sid, key -> new Entry());
    synchronized (entry) {
      if (entry.phase != Phase.NOT_STARTED) return false;
      entry.phase = Phase.IN_PROGRESS;
      return true;
    }
  }

  /** Marks mandatory cleanup finished. Idempotent. */
  public static void markCompleted(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    Entry entry = STATES.computeIfAbsent(callId.trim(), key -> new Entry());
    synchronized (entry) {
      entry.phase = Phase.COMPLETED;
    }
  }

  public static boolean isInProgress(String callId) {
    return phase(callId) == Phase.IN_PROGRESS;
  }

  public static boolean isCompleted(String callId) {
    return phase(callId) == Phase.COMPLETED;
  }

  public static void clearForTests() {
    STATES.clear();
  }
}
