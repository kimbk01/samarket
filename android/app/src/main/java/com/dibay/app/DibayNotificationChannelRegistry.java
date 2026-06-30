package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * SSOT message / general notification channels only.
 * Incoming call, missed call, and native call channels are never created here.
 */
public final class DibayNotificationChannelRegistry {
  private static final String TAG = "DIBAY_NOTIF_CH";
  /** SSOT default — {@code notification-sound-registry} messenger chat events. */
  public static final String DEFAULT_MESSAGE_CHANNEL_ID = "dibay_chat_messages_v1";

  private static final Set<String> MESSAGE_CHANNEL_IDS = new HashSet<>();
  private static final Set<String> CALL_CHANNEL_IDS = new HashSet<>();
  private static final Map<String, String> CHANNEL_LABELS = new HashMap<>();

  static {
    registerMessageChannel("dibay_chat_messages_v1", "채팅 메시지", "채팅·메신저 메시지 알림");
    registerMessageChannel("dibay_trade_v1", "거래 알림", "거래 채팅·거래 상태 알림");
    registerMessageChannel("dibay_orders_v1", "주문 알림", "스토어·주문 알림");
    registerMessageChannel("dibay_delivery_v1", "배달 알림", "배달·매장 주문 알림");
    registerMessageChannel("dibay_community_v1", "커뮤니티 알림", "커뮤니티 활동 알림");
    registerMessageChannel("dibay_admin_notice_v1", "공지 알림", "공지·마케팅 알림");
    // Legacy FCM channel id — ensure only; new posts use SSOT v1 ids.
    registerMessageChannel("dibay_messages", "채팅 메시지", "채팅 메시지 알림 (legacy)");

    CALL_CHANNEL_IDS.add("dibay_calls_incoming_v7");
    CALL_CHANNEL_IDS.add("dibay_incoming_calls");
    CALL_CHANNEL_IDS.add("dibay_calls_missed_v1");
    CALL_CHANNEL_IDS.add("dibay_calls_missed");
    CALL_CHANNEL_IDS.add("dibay_native_voice_incoming");
    CALL_CHANNEL_IDS.add("dibay_native_video_incoming");
    CALL_CHANNEL_IDS.add("dibay_native_voice_call");
    CALL_CHANNEL_IDS.add("dibay_native_video_call");
    CALL_CHANNEL_IDS.add("dibay_active_call");
  }

  private DibayNotificationChannelRegistry() {}

  private static void registerMessageChannel(String id, String name, String description) {
    MESSAGE_CHANNEL_IDS.add(id);
    CHANNEL_LABELS.put(id, name + "\0" + description);
  }

  public static boolean isCallChannelId(String channelId) {
    if (channelId == null || channelId.trim().isEmpty()) return false;
    String id = channelId.trim();
    if (CALL_CHANNEL_IDS.contains(id)) return true;
    return id.startsWith("dibay_calls_")
        || id.startsWith("dibay_native_voice_")
        || id.startsWith("dibay_native_video_");
  }

  public static boolean isAllowedMessageChannelId(String channelId) {
    if (channelId == null || channelId.trim().isEmpty()) return false;
    String id = channelId.trim();
    if (isCallChannelId(id)) return false;
    return MESSAGE_CHANNEL_IDS.contains(id);
  }

  public static String resolveMessageChannelIdFromFcmData(Map<String, String> data) {
    String raw = firstNonEmpty(
        data != null ? data.get("androidChannelId") : null,
        data != null ? data.get("android_channel_id") : null);
    if (isAllowedMessageChannelId(raw)) return raw;
    if (raw != null && isCallChannelId(raw)) {
      Log.w(TAG, "[fcm] call_channel_rejected_for_message id=" + raw);
    }
    return DEFAULT_MESSAGE_CHANNEL_ID;
  }

  public static String ensureMessageChannel(Context context, String requestedChannelId) {
    String channelId =
        isAllowedMessageChannelId(requestedChannelId)
            ? requestedChannelId.trim()
            : DEFAULT_MESSAGE_CHANNEL_ID;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return channelId;
    Context app = context.getApplicationContext();
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm == null) return channelId;
    if (nm.getNotificationChannel(channelId) != null) return channelId;

    String labelPair = CHANNEL_LABELS.get(channelId);
    String name = "DIBAY 알림";
    String description = "메시지 알림";
    if (labelPair != null) {
      String[] parts = labelPair.split("\0", 2);
      name = parts[0];
      if (parts.length > 1) description = parts[1];
    }

    NotificationChannel channel =
        new NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription(description);
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(channel);
    Log.i(TAG, "[channel] created id=" + channelId);
    return channelId;
  }

  private static String firstNonEmpty(String... values) {
    if (values == null) return null;
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }
}
