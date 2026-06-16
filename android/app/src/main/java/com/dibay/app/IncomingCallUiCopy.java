package com.dibay.app;

import android.content.Context;

/** Shared caller/status copy for foreground pill, lock fullscreen, and notification. */
public final class IncomingCallUiCopy {
  private IncomingCallUiCopy() {}

  public static String callerDisplayName(String callerName, String title, String body) {
    if (callerName != null && !callerName.trim().isEmpty()) {
      return callerName.trim();
    }
    return resolveCallerDisplayName(title, body);
  }

  public static String statusBrandLabel(Context context, String callType, String title, String body) {
    if (context == null) return brandLabelForCallType(callType, title, body);
    if ("video".equalsIgnoreCase(callType)) {
      return context.getString(R.string.dibay_incoming_video_brand);
    }
    if ("audio".equalsIgnoreCase(callType)
        || "voice".equalsIgnoreCase(callType)
        || containsVideoHint(title, body)) {
      if (containsVideoHint(title, body)) {
        return context.getString(R.string.dibay_incoming_video_brand);
      }
      return context.getString(R.string.dibay_incoming_voice_brand);
    }
    if (containsVideoHint(title, body)) {
      return context.getString(R.string.dibay_incoming_video_brand);
    }
    return context.getString(R.string.dibay_incoming_voice_brand);
  }

  public static String acceptLabel(Context context) {
    return context.getString(R.string.dibay_incoming_accept);
  }

  public static String rejectLabel(Context context) {
    return context.getString(R.string.dibay_incoming_reject);
  }

  public static String peerInitial(String label) {
    if (label == null || label.trim().isEmpty()) return "?";
    return label.trim().substring(0, 1);
  }

  private static String brandLabelForCallType(String callType, String title, String body) {
    if ("video".equalsIgnoreCase(callType) || containsVideoHint(title, body)) {
      return "DiBay 영상 통화";
    }
    return "DiBay 음성 통화";
  }

  private static boolean containsVideoHint(String title, String body) {
    if (title != null && title.contains("영상")) return true;
    return body != null && body.contains("영상");
  }

  private static String resolveCallerDisplayName(String title, String body) {
    String b = body != null ? body.trim() : "";
    if (!b.isEmpty()) {
      if (b.endsWith("님의 전화")) {
        String name = b.substring(0, b.length() - "님의 전화".length()).trim();
        if (!name.isEmpty()) return name;
      }
      return b;
    }
    String t = title != null ? title.trim() : "";
    if (!t.isEmpty() && !isCallKindLabel(t)) return t;
    return "DIBAY";
  }

  private static boolean isCallKindLabel(String value) {
    return "음성 통화".equals(value)
        || "영상 통화".equals(value)
        || "DiBay 음성 통화".equals(value)
        || "DiBay 영상 통화".equals(value);
  }
}
