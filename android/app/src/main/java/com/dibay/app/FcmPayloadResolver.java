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
    if ("call_ended".equals(callPushKind)) return "call_ended";
    if ("call_rejected".equals(callPushKind)) return "call_rejected";
    if ("call_missed".equals(callPushKind)) return "call_missed";
    if ("1".equals(data.get("dibay_call"))) return "incoming_call";

    String notificationType = firstNonEmpty(data.get("notification_type"));
    if ("community_messenger_incoming_call".equals(notificationType)) return "incoming_call";
    if ("community_messenger_missed_call".equals(notificationType)) return "missed_call";
    if ("community_messenger_call_canceled".equals(notificationType)) return "call_canceled";
    if ("community_messenger_message".equals(notificationType)) return "chat_message";

    return "unknown";
  }

  public static String resolveCallId(Map<String, String> data) {
    if (data == null) return null;
    String callId = firstNonEmpty(data.get("callId"));
    if (callId != null) return callId;
    return firstNonEmpty(data.get("sessionId"), data.get("session_id"));
  }

  public static IncomingCallPayload resolveIncomingCallPayload(
      Map<String, String> data, String title, String body) {
    if (data == null) return IncomingCallPayload.invalid("no_data");
    String callId = resolveCallId(data);
    String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
    String callerId = firstNonEmpty(data.get("callerId"), data.get("caller_id"));
    String callerName =
        firstNonEmpty(data.get("callerName"), data.get("caller_name"), data.get("title"), title);
    String callerAvatarUrl =
        firstNonEmpty(
            data.get("callerAvatarUrl"),
            data.get("caller_avatar_url"),
            data.get("callerAvatar"),
            data.get("caller_avatar"));
    String rawCallType =
        firstNonEmpty(
            data.get("callType"),
            data.get("call_type"),
            data.get("mediaType"),
            data.get("media_type"),
            data.get("kind"),
            data.get("callKind"),
            data.get("call_kind"));
    String callType = normalizeCallType(rawCallType);
    String expiresAt = firstNonEmpty(data.get("expiresAt"), data.get("expires_at"));
    String invalid = null;
    if (callId == null) invalid = "missing_call_id";
    else if (roomId == null) invalid = "missing_room_id";
    else if (callerId == null) invalid = "missing_caller_id";
    else if (callType == null) invalid = "missing_call_type";
    if (invalid != null) {
      return IncomingCallPayload.invalid(invalid);
    }
    return new IncomingCallPayload(
        callId,
        roomId,
        callerId,
        callerName != null ? callerName : "수신 통화",
        callerAvatarUrl,
        callType,
        expiresAt,
        title,
        body,
        null);
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
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (callId != null && roomId != null) {
          return "/community-messenger/rooms/"
              + android.net.Uri.encode(roomId)
              + "?focus=call-history&callId="
              + android.net.Uri.encode(callId);
        }
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
      case "group_message": {
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (roomId != null) {
          return "/community-messenger/rooms/"
              + android.net.Uri.encode(roomId)
              + "?type=group";
        }
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

  public static String resolveMissedCallRoute(String callId, String roomId) {
    String cid = callId != null ? callId.trim() : "";
    String rid = roomId != null ? roomId.trim() : "";
    if (!cid.isEmpty() && !rid.isEmpty()) {
      return "/community-messenger/rooms/"
          + android.net.Uri.encode(rid)
          + "?focus=call-history&callId="
          + android.net.Uri.encode(cid);
    }
    if (!cid.isEmpty()) return "/community-messenger/calls/logs?callId=" + android.net.Uri.encode(cid);
    return null;
  }

  public static boolean isStandardRouteType(String type) {
    return "chat_message".equals(type)
        || "group_message".equals(type)
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

  private static String normalizeCallType(String value) {
    String v = value != null ? value.trim().toLowerCase(Locale.US) : "";
    if ("video".equals(v)) return "video";
    if ("audio".equals(v) || "voice".equals(v)) return "audio";
    return null;
  }
}
