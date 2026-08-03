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
    if ("call_answered_elsewhere".equals(callPushKind)) return "call_answered_elsewhere";
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
    String callSoundEventKey =
        firstNonEmpty(
            data.get("callSoundEventKey"),
            data.get("call_sound_event_key"),
            data.get("eventKey"),
            data.get("event_key"));
    String ringtoneUrl = firstNonEmpty(data.get("ringtoneUrl"), data.get("ringtone_url"));
    String soundAssetId = firstNonEmpty(data.get("soundAssetId"), data.get("sound_asset_id"));
    String ringtonePolicy =
        firstNonEmpty(data.get("ringtonePolicy"), data.get("ringtone_policy"));
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
        callSoundEventKey,
        ringtoneUrl,
        soundAssetId,
        ringtonePolicy,
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

  /**
   * P1 — Prefer P0 push envelope (schemaVersion/eventClass) over legacy url.
   * Invalid/present envelope → {@code /notifications} (no legacy URL bypass).
   * Absent envelope → legacy type/url resolution.
   */
  public static String resolveRouteUrl(Map<String, String> data) {
    if (data == null) return null;
    String envelopeRoute = resolveEnvelopeRoute(data);
    if (envelopeRoute != null) return envelopeRoute;

    String url = firstNonEmpty(data.get("url"), data.get("routeUrl"), data.get("route_url"));
    if (url != null && url.startsWith("/")) return url;

    String type = resolveType(data);
    switch (type) {
      case "missed_call": {
        String callId = resolveCallId(data);
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (callId != null && roomId != null) {
          return "/community-messenger/rooms/"
              + encQuery(roomId)
              + "?focus=call-history&callId="
              + encQuery(callId);
        }
        if (callId != null) {
          return "/community-messenger/calls/logs?callId=" + encQuery(callId);
        }
        break;
      }
      case "incoming_call": {
        String callId = resolveCallId(data);
        if (callId != null) {
          return "/community-messenger/calls/" + encQuery(callId);
        }
        break;
      }
      case "chat_message": {
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (roomId != null) return "/community-messenger/rooms/" + encQuery(roomId);
        break;
      }
      case "group_message": {
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (roomId != null) {
          return "/community-messenger/rooms/"
              + encQuery(roomId)
              + "?type=group";
        }
        break;
      }
      case "trade_message": {
        String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
        if (roomId != null) return "/chats/" + encQuery(roomId);
        break;
      }
      case "delivery_order": {
        String orderId = firstNonEmpty(data.get("orderId"), data.get("order_id"));
        if (orderId != null) return "/orders/store/" + encQuery(orderId);
        break;
      }
      case "community_comment": {
        String postId = firstNonEmpty(data.get("postId"), data.get("post_id"));
        if (postId != null) return "/philife/posts/" + encQuery(postId);
        break;
      }
      default:
        break;
    }

    if (url != null && !url.isEmpty()) return url;
    String roomId = firstNonEmpty(data.get("roomId"), data.get("room_id"));
    if (roomId != null) return "/community-messenger/rooms/" + encQuery(roomId);
    return null;
  }

  public static String resolveMissedCallRoute(String callId, String roomId) {
    String cid = callId != null ? callId.trim() : "";
    String rid = roomId != null ? roomId.trim() : "";
    if (!cid.isEmpty() && !rid.isEmpty()) {
      return "/community-messenger/rooms/"
          + encQuery(rid)
          + "?focus=call-history&callId="
          + encQuery(cid);
    }
    if (!cid.isEmpty()) return "/community-messenger/calls/logs?callId=" + encQuery(cid);
    return null;
  }

  public static boolean isStandardRouteType(String type) {
    return "chat_message".equals(type)
        || "group_message".equals(type)
        || "trade_message".equals(type)
        || "delivery_order".equals(type)
        || "community_comment".equals(type);
  }

  /** True when P0 envelope wire fields are present on FCM data. */
  public static boolean isPushEnvelopePresent(Map<String, String> data) {
    if (data == null) return false;
    return firstNonEmpty(data.get("schemaVersion"), data.get("eventClass")) != null;
  }

  /**
   * @return envelope canonical/fallback path when present; null when envelope absent
   */
  public static String resolveEnvelopeRoute(Map<String, String> data) {
    if (!isPushEnvelopePresent(data)) return null;
    String schema = firstNonEmpty(data.get("schemaVersion"));
    String eventClass = firstNonEmpty(data.get("eventClass"));
    if (schema != null && !"1".equals(schema)) {
      return PUSH_SAFE_FALLBACK_ROUTE;
    }
    if (eventClass == null) return PUSH_SAFE_FALLBACK_ROUTE;

    String channel = firstNonEmpty(data.get("campaignChannel"), data.get("campaign_channel"));
    String targetKind = firstNonEmpty(data.get("targetKind"), data.get("target_kind"));
    String targetTab = firstNonEmpty(data.get("targetTab"), data.get("target_tab"));
    String notificationEventId =
        firstNonEmpty(
            data.get("targetNotificationId"),
            data.get("target_notification_id"),
            data.get("notificationEventId"),
            data.get("notification_event_id"),
            data.get("notificationId"));
    String approvedRoute =
        safeInternalRoute(
            firstNonEmpty(
                data.get("targetApprovedRoute"),
                data.get("approvedRoute"),
                data.get("routeUrl"),
                data.get("route_url")));
    String storeId = firstNonEmpty(data.get("storeId"), data.get("store_id"));
    String operationType = firstNonEmpty(data.get("operationType"), data.get("operation_type"));
    String entityId =
        firstNonEmpty(data.get("targetEntityId"), data.get("entityId"), data.get("entity_id"));

    if ("admin_notice".equals(eventClass)) {
      if (notificationEventId == null) return PUSH_SAFE_FALLBACK_ROUTE;
      if ("approved_internal_route".equals(targetKind) && approvedRoute != null) {
        return approvedRoute;
      }
      return buildNotificationCenterPath("system", notificationEventId);
    }

    if ("admin_marketing".equals(eventClass)) {
      String effectiveChannel = channel != null ? channel : "push_and_in_app";
      if ("push_only".equals(effectiveChannel)) {
        if (approvedRoute != null) return approvedRoute;
        return PUSH_SAFE_FALLBACK_ROUTE;
      }
      if (notificationEventId == null) return PUSH_SAFE_FALLBACK_ROUTE;
      if ("approved_internal_route".equals(targetKind) && approvedRoute != null) {
        return approvedRoute;
      }
      String tab = "marketing".equals(targetTab) ? "marketing" : "marketing";
      return buildNotificationCenterPath(tab, notificationEventId);
    }

    if ("owner_operation".equals(eventClass)) {
      if (storeId == null || operationType == null) return PUSH_SAFE_FALLBACK_ROUTE;
      return resolveOwnerOperationRoute(storeId, operationType, entityId);
    }

    return PUSH_SAFE_FALLBACK_ROUTE;
  }

  private static final String PUSH_SAFE_FALLBACK_ROUTE = "/notifications";

  private static String buildNotificationCenterPath(String tab, String notificationId) {
    return PUSH_SAFE_FALLBACK_ROUTE
        + "?tab="
        + encQuery(tab)
        + "&notificationId="
        + encQuery(notificationId);
  }

  private static String resolveOwnerOperationRoute(
      String storeId, String operationType, String entityId) {
    String op = operationType.trim().toLowerCase(Locale.US);
    String q = "storeId=" + encQuery(storeId) + "&fresh_list=1";
    if ("inquiry".equals(op) || "inquiries".equals(op) || "open_inquiry".equals(op)) {
      String path = "/stores/owner/inquiries?" + q;
      if (entityId != null) path += "&inquiryId=" + encQuery(entityId);
      return path;
    }
    String tab = "all";
    if ("refund".equals(op) || "refund_pending".equals(op)) tab = "refund";
    else if ("cancel".equals(op) || "cancelled".equals(op) || "cancel_pending".equals(op)) {
      tab = "cancelled";
    } else if ("new_order".equals(op)
        || "pending_order".equals(op)
        || "order".equals(op)
        || "orders".equals(op)
        || "pending".equals(op)) {
      tab = "new";
    }
    String path = "/stores/owner/orders?" + q;
    if (!"all".equals(tab)) path += "&tab=" + encQuery(tab);
    if (entityId != null) path += "&order_id=" + encQuery(entityId);
    return path;
  }

  /** JVM-unit-test safe query encoding (avoid unmocked {@code Uri.encode}). */
  private static String encQuery(String value) {
    try {
      return java.net.URLEncoder.encode(value, "UTF-8");
    } catch (java.io.UnsupportedEncodingException e) {
      return value;
    }
  }

  private static String safeInternalRoute(String raw) {
    if (raw == null) return null;
    String route = raw.trim();
    if (route.isEmpty()) return null;
    if (route.startsWith("http://") || route.startsWith("https://")) {
      try {
        android.net.Uri parsed = android.net.Uri.parse(route);
        String path = parsed.getPath();
        if (path == null || path.isEmpty()) return null;
        String q = parsed.getEncodedQuery();
        String f = parsed.getEncodedFragment();
        route = path + (q != null && !q.isEmpty() ? "?" + q : "") + (f != null ? "#" + f : "");
      } catch (Exception e) {
        return null;
      }
    }
    if (!route.startsWith("/") || route.startsWith("//")) return null;
    return route;
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

final class IncomingCallPayload {
  final String callId;
  final String roomId;
  final String callerId;
  final String callerName;
  final String callerAvatarUrl;
  final String callType;
  final String expiresAt;
  final String title;
  final String body;
  final String callSoundEventKey;
  final String ringtoneUrl;
  final String soundAssetId;
  /** SSOT: custom | default | silent — never treat URL-null alone as silent. */
  final String ringtonePolicy;
  final String invalidReason;

  IncomingCallPayload(
      String callId,
      String roomId,
      String callerId,
      String callerName,
      String callerAvatarUrl,
      String callType,
      String expiresAt,
      String title,
      String body,
      String invalidReason) {
    this(
        callId,
        roomId,
        callerId,
        callerName,
        callerAvatarUrl,
        callType,
        expiresAt,
        title,
        body,
        null,
        null,
        null,
        null,
        invalidReason);
  }

  IncomingCallPayload(
      String callId,
      String roomId,
      String callerId,
      String callerName,
      String callerAvatarUrl,
      String callType,
      String expiresAt,
      String title,
      String body,
      String callSoundEventKey,
      String ringtoneUrl,
      String soundAssetId,
      String invalidReason) {
    this(
        callId,
        roomId,
        callerId,
        callerName,
        callerAvatarUrl,
        callType,
        expiresAt,
        title,
        body,
        callSoundEventKey,
        ringtoneUrl,
        soundAssetId,
        null,
        invalidReason);
  }

  IncomingCallPayload(
      String callId,
      String roomId,
      String callerId,
      String callerName,
      String callerAvatarUrl,
      String callType,
      String expiresAt,
      String title,
      String body,
      String callSoundEventKey,
      String ringtoneUrl,
      String soundAssetId,
      String ringtonePolicy,
      String invalidReason) {
    this.callId = callId;
    this.roomId = roomId;
    this.callerId = callerId;
    this.callerName = callerName;
    this.callerAvatarUrl = callerAvatarUrl;
    this.callType = callType;
    this.expiresAt = expiresAt;
    this.title = title;
    this.body = body;
    this.callSoundEventKey = callSoundEventKey;
    this.ringtoneUrl = ringtoneUrl;
    this.soundAssetId = soundAssetId;
    this.ringtonePolicy = ringtonePolicy;
    this.invalidReason = invalidReason;
  }

  static IncomingCallPayload invalid(String reason) {
    return new IncomingCallPayload(null, null, null, null, null, null, null, null, null, reason);
  }

  boolean isValid() {
    return invalidReason == null && callId != null && roomId != null && callerId != null && callType != null;
  }

  IncomingCallPayload withExpiresAt(String nextExpiresAt) {
    return new IncomingCallPayload(
        callId,
        roomId,
        callerId,
        callerName,
        callerAvatarUrl,
        callType,
        nextExpiresAt != null ? nextExpiresAt : expiresAt,
        title,
        body,
        callSoundEventKey,
        ringtoneUrl,
        soundAssetId,
        ringtonePolicy,
        invalidReason);
  }
}
