package com.dibay.app;

import android.os.Build;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** FCM data payload type resolution — `type` field with legacy fallback. */
public final class FcmPayloadResolver {
  private static final String TAG = "DIBAY_FCM";

  private FcmPayloadResolver() {}

  public static String resolveType(Map<String, String> data) {
    if (data == null) return "unknown";
    String type = firstNonEmpty(data.get("type"));
    if (type != null) return type;

    String callPushKind = firstNonEmpty(data.get("call_push_kind"));
    if ("incoming_call".equals(callPushKind)) return "incoming_call";
    if ("missed_call".equals(callPushKind)) return "missed_call";
    if ("call_canceled".equals(callPushKind)) return "call_canceled";
    if ("1".equals(data.get("dibay_call"))) return "incoming_call";

    String notificationType = firstNonEmpty(data.get("notification_type"));
    if ("community_messenger_incoming_call".equals(notificationType)) return "incoming_call";
    if ("community_messenger_missed_call".equals(notificationType)) return "missed_call";
    if ("community_messenger_message".equals(notificationType)) return "chat_message";

    return "unknown";
  }

  public static String resolveCallId(Map<String, String> data) {
    if (data == null) return null;
    String callId = firstNonEmpty(data.get("callId"));
    if (callId != null) return callId;
    return firstNonEmpty(data.get("sessionId"), data.get("session_id"));
  }

  public static boolean isExpired(Map<String, String> data) {
    if (data == null) return false;
    String expiresAt = firstNonEmpty(data.get("expiresAt"), data.get("expires_at"));
    if (expiresAt == null) return false;
    try {
      long expiresMs;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        expiresMs = java.time.Instant.parse(expiresAt).toEpochMilli();
      } else {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        String normalized = expiresAt.contains(".") ? expiresAt : expiresAt.replace("Z", ".000Z");
        expiresMs = iso.parse(normalized).getTime();
      }
      return System.currentTimeMillis() > expiresMs;
    } catch (Exception e) {
      Log.w(TAG, "[incoming-call-native] expiresAt_parse_failed value=" + expiresAt);
      return false;
    }
  }

  public static String resolveRouteUrl(Map<String, String> data) {
    if (data == null) return null;
    String url = firstNonEmpty(data.get("url"));
    if (url != null && url.startsWith("/")) return url;

    String type = resolveType(data);
    switch (type) {
      case "missed_call": {
        String callId = resolveCallId(data);
        if (callId != null) {
          return "/community-messenger/calls/logs?callId=" + android.net.Uri.encode(callId);
        }
        break;
      }
      case "incoming_call": {
        String callId = resolveCallId(data);
        if (callId != null) {
          return "/community-messenger/calls/" + android.net.Uri.encode(callId);
        }
        break;
      }
      case "chat_message": {
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (roomId != null) return "/community-messenger/rooms/" + android.net.Uri.encode(roomId);
        break;
      }
      case "trade_message": {
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (roomId != null) return "/chats/" + android.net.Uri.encode(roomId);
        break;
      }
      case "delivery_order": {
        String orderId = firstNonEmpty(data.get("orderId"), data.get("order_id"));
        if (orderId != null) return "/orders/store/" + android.net.Uri.encode(orderId);
        break;
      }
      case "community_comment": {
        String postId = firstNonEmpty(data.get("postId"), data.get("post_id"));
        if (postId != null) return "/philife/posts/" + android.net.Uri.encode(postId);
        break;
      }
      default:
        break;
    }

    if (url != null && !url.isEmpty()) return url;
    String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
    if (roomId != null) return "/community-messenger/rooms/" + android.net.Uri.encode(roomId);
    return null;
  }

  public static boolean isStandardRouteType(String type) {
    return "chat_message".equals(type)
        || "trade_message".equals(type)
        || "delivery_order".equals(type)
        || "community_comment".equals(type);
  }

  private static String firstNonEmpty(String... values) {
    if (values == null) return null;
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }
}
