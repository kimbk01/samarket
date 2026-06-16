package com.dibay.app;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import com.google.firebase.messaging.RemoteMessage;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** Unified diagnostics for native incoming-call push handling. */
public final class DibayCallPushLog {
  public static final String TAG = "DIBAY_CALL_PUSH";
  private static final long LATE_DELIVERY_THRESHOLD_MS = 10_000L;
  private static final long INCOMING_GRACE_MS = 15_000L;

  private DibayCallPushLog() {}

  public static void info(String event, String callId, String extra) {
    Log.i(TAG, format(event, callId, extra));
  }

  public static void warn(String event, String callId, String extra) {
    Log.w(TAG, format(event, callId, extra));
  }

  public static void logIncomingReceived(
      Context context,
      RemoteMessage message,
      Map<String, String> data,
      IncomingCallPayload payload,
      boolean appVisible,
      long receivedAtMs) {
    String callId = payload != null ? payload.callId : FcmPayloadResolver.resolveCallId(data);
    String extra =
        "roomId="
            + value(payload != null ? payload.roomId : first(data, "roomId", "room_id"))
            + " callerId="
            + value(payload != null ? payload.callerId : first(data, "callerId", "caller_id"))
            + " mediaType="
            + value(payload != null ? payload.callType : first(data, "mediaType", "callType", "kind"))
            + " sentAt="
            + value(first(data, "sentAt", "sent_at", "createdAt", "created_at"))
            + " receivedAt="
            + receivedAtMs
            + " expiresAt="
            + value(payload != null ? payload.expiresAt : first(data, "expiresAt", "expires_at"))
            + " appVisible="
            + appVisible
            + " screenInteractive="
            + DibayKeyguardHelper.isInteractive(context)
            + " keyguardLocked="
            + DibayKeyguardHelper.isKeyguardLocked(context)
            + " isDeviceIdleMode="
            + isDeviceIdleMode(context)
            + " priority="
            + priorityName(message != null ? message.getPriority() : 0)
            + " originalPriority="
            + priorityName(message != null ? message.getOriginalPriority() : 0);
    info("fcm_incoming_received", callId, extra);
  }

  public static void logPriorityCheck(RemoteMessage message, Map<String, String> data, String callId) {
    String extra =
        "priority="
            + priorityName(message != null ? message.getPriority() : 0)
            + " originalPriority="
            + priorityName(message != null ? message.getOriginalPriority() : 0)
            + " priorityHint="
            + value(first(data, "priority", "priorityHint", "androidPriority"));
    info("fcm_priority_check", callId, extra);
  }

  public static ExpiryDecision resolveIncomingExpiry(
      Context context, Map<String, String> data, IncomingCallPayload payload, long receivedAtMs) {
    long serverExpiresAt = parseTimestampMs(payload != null ? payload.expiresAt : null);
    long sentAt = parseTimestampMs(first(data, "sentAt", "sent_at", "createdAt", "created_at"));
    long delayMs = sentAt > 0 ? receivedAtMs - sentAt : -1L;
    boolean late = delayMs > LATE_DELIVERY_THRESHOLD_MS;
    long graceExpiresAt = receivedAtMs + INCOMING_GRACE_MS;
    long effectiveExpiresAt = Math.max(serverExpiresAt, graceExpiresAt);
    String callId = payload != null ? payload.callId : FcmPayloadResolver.resolveCallId(data);

    if (late) {
      info(
          "doze_delivery_late_detected",
          callId,
          "delayMs="
              + delayMs
              + " serverExpiresAt="
              + serverExpiresAt
              + " localReceivedAt="
              + receivedAtMs
              + " graceApplied="
              + (serverExpiresAt > 0 && serverExpiresAt < receivedAtMs));
    }

    if (serverExpiresAt > 0 && serverExpiresAt < receivedAtMs && effectiveExpiresAt > receivedAtMs) {
      info(
          "incoming_expiry_grace_applied",
          callId,
          "serverExpiresAt="
              + serverExpiresAt
              + " localReceivedAt="
              + receivedAtMs
              + " effectiveExpiresAt="
              + effectiveExpiresAt
              + " idle="
              + isDeviceIdleMode(context));
    }

    return new ExpiryDecision(serverExpiresAt, effectiveExpiresAt, receivedAtMs > effectiveExpiresAt, delayMs);
  }

  public static boolean isDeviceIdleMode(Context context) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    PowerManager pm = context.getSystemService(PowerManager.class);
    return pm != null && pm.isDeviceIdleMode();
  }

  static long parseTimestampMs(String value) {
    if (value == null || value.trim().isEmpty()) return 0L;
    String raw = value.trim();
    try {
      return Long.parseLong(raw);
    } catch (NumberFormatException ignored) {
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        return java.time.Instant.parse(raw).toEpochMilli();
      }
      SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
      iso.setTimeZone(TimeZone.getTimeZone("UTC"));
      String normalized = raw.contains(".") ? raw : raw.replace("Z", ".000Z");
      return iso.parse(normalized).getTime();
    } catch (Exception ignored) {
      return 0L;
    }
  }

  private static String priorityName(int priority) {
    if (priority == RemoteMessage.PRIORITY_HIGH) return "HIGH";
    if (priority == RemoteMessage.PRIORITY_NORMAL) return "NORMAL";
    return String.valueOf(priority);
  }

  private static String first(Map<String, String> data, String... keys) {
    if (data == null || keys == null) return null;
    for (String key : keys) {
      String value = data.get(key);
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }

  private static String value(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "-";
  }

  private static String format(String event, String callId, String extra) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : "unknown";
    String suffix = extra != null && !extra.trim().isEmpty() ? " " + extra.trim() : "";
    return "[DIBAY_CALL_PUSH] " + event + " callId=" + sid + suffix;
  }

  public static final class ExpiryDecision {
    public final long serverExpiresAtMs;
    public final long effectiveExpiresAtMs;
    public final boolean expired;
    public final long deliveryDelayMs;

    ExpiryDecision(long serverExpiresAtMs, long effectiveExpiresAtMs, boolean expired, long deliveryDelayMs) {
      this.serverExpiresAtMs = serverExpiresAtMs;
      this.effectiveExpiresAtMs = effectiveExpiresAtMs;
      this.expired = expired;
      this.deliveryDelayMs = deliveryDelayMs;
    }
  }
}
