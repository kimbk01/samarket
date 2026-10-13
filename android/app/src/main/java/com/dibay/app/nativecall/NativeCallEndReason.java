package com.dibay.app.nativecall;

/**
 * Diagnostic {@code clientEndedReason} values for native {@code action=end} PATCH bodies.
 *
 * <p>CONTRACT: every value is prefixed {@code native_} so it can never match a server-trusted
 * reason or alias ({@code TRUSTED_CLIENT_ENDED_REASONS} / {@code CLIENT_REASON_ALIASES} in
 * lib/community-messenger/call-authority/call-terminal-reason-authority.ts). The server therefore
 * keeps its default ended_reason (ended_by_caller / ended_by_callee); these values only name which
 * native trigger sent the end.
 */
public final class NativeCallEndReason {
  public static final String USER_END = "native_user_end";
  public static final String DOCK_END = "native_dock_end";
  public static final String NOTIFICATION_END = "native_notification_end";
  public static final String BACK_CANCEL = "native_back_cancel";
  public static final String ACTIVITY_DESTROYED = "native_activity_destroyed";
  public static final String TASK_REMOVED = "native_task_removed";
  public static final String REMOTE_LEFT = "native_remote_left";
  public static final String FAIL_PROPAGATE = "native_fail_propagate";
  public static final String OTHER = "native_other";

  /** Trigger source passed to {@code Native*CallRuntime.end(ctx, id, source)}. */
  public static final String SOURCE_UI = "ui";
  public static final String SOURCE_DOCK = "dock";
  public static final String SOURCE_NOTIFICATION = "notification";
  public static final String SOURCE_ACTIVITY_DESTROYED = "activity_destroyed";
  public static final String SOURCE_TASK_REMOVED = "task_removed";
  public static final String SOURCE_REMOTE_LEFT = "remote_left";
  public static final String SOURCE_FAIL = "fail";

  private NativeCallEndReason() {}

  public static String fromSource(String source) {
    String s = source != null ? source.trim().toLowerCase() : "";
    if (s.isEmpty() || SOURCE_UI.equals(s)) return USER_END;
    if (SOURCE_DOCK.equals(s)) return DOCK_END;
    if (SOURCE_NOTIFICATION.equals(s)) return NOTIFICATION_END;
    if (s.startsWith("back")) return BACK_CANCEL;
    if (SOURCE_ACTIVITY_DESTROYED.equals(s)) return ACTIVITY_DESTROYED;
    if (SOURCE_TASK_REMOVED.equals(s)) return TASK_REMOVED;
    if (SOURCE_REMOTE_LEFT.equals(s)) return REMOTE_LEFT;
    if (SOURCE_FAIL.equals(s)) return FAIL_PROPAGATE;
    return OTHER;
  }
}
