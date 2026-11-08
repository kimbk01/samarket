package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import java.util.LinkedHashMap;
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
  /** D-Q3 — 서버 FCM data {@code soundMode=silent}: 알림음·진동 끔. */
  public static final String SILENT_MESSAGE_CHANNEL_ID = "dibay_msg_silent_v1";
  /** D-Q3 — 서버 FCM data {@code soundMode=no_vibrate}: 기본음·진동 끔. */
  public static final String NO_VIBRATE_MESSAGE_CHANNEL_ID = "dibay_msg_novibrate_v1";

  private static final Set<String> MESSAGE_CHANNEL_IDS = new HashSet<>();
  private static final Set<String> CALL_CHANNEL_IDS = new HashSet<>();
  /** 언어 SSOT S8-4a: 채널 이름·설명 = 리소스(기본 영어·values-ko), 앱 언어로 읽음 — {name 리소스, 설명 리소스} */
  private static final Map<String, int[]> CHANNEL_LABELS = new LinkedHashMap<>();

  static {
    registerMessageChannel("dibay_chat_messages_v1", R.string.dibay_notif_ch_chat_name, R.string.dibay_notif_ch_chat_desc);
    registerMessageChannel("dibay_trade_v1", R.string.dibay_notif_ch_trade_name, R.string.dibay_notif_ch_trade_desc);
    registerMessageChannel("dibay_orders_v1", R.string.dibay_notif_ch_orders_name, R.string.dibay_notif_ch_orders_desc);
    registerMessageChannel("dibay_delivery_v1", R.string.dibay_notif_ch_delivery_name, R.string.dibay_notif_ch_delivery_desc);
    registerMessageChannel("dibay_community_v1", R.string.dibay_notif_ch_community_name, R.string.dibay_notif_ch_community_desc);
    registerMessageChannel("dibay_admin_notice_v1", R.string.dibay_notif_ch_notice_name, R.string.dibay_notif_ch_notice_desc);
    registerMessageChannel(SILENT_MESSAGE_CHANNEL_ID, R.string.dibay_notif_ch_silent_name, R.string.dibay_notif_ch_silent_desc);
    registerMessageChannel(NO_VIBRATE_MESSAGE_CHANNEL_ID, R.string.dibay_notif_ch_novibrate_name, R.string.dibay_notif_ch_novibrate_desc);
    // Legacy FCM channel id — ensure only; new posts use SSOT v1 ids.
    registerMessageChannel("dibay_messages", R.string.dibay_notif_ch_chat_name, R.string.dibay_notif_ch_legacy_chat_desc);

    CALL_CHANNEL_IDS.add("dibay_calls_incoming_v7");
    CALL_CHANNEL_IDS.add("dibay_incoming_calls");
    CALL_CHANNEL_IDS.add("dibay_calls_missed_v1");
    CALL_CHANNEL_IDS.add("dibay_calls_missed");
    CALL_CHANNEL_IDS.add("dibay_native_voice_incoming");
    CALL_CHANNEL_IDS.add("dibay_native_voice_incoming_v2");
    CALL_CHANNEL_IDS.add("dibay_native_video_incoming");
    CALL_CHANNEL_IDS.add("dibay_native_video_incoming_v2");
    CALL_CHANNEL_IDS.add("dibay_native_voice_call");
    CALL_CHANNEL_IDS.add("dibay_native_voice_call_v2");
    CALL_CHANNEL_IDS.add("dibay_native_video_call");
    CALL_CHANNEL_IDS.add("dibay_native_video_call_v2");
    CALL_CHANNEL_IDS.add("dibay_active_call");
  }

  private DibayNotificationChannelRegistry() {}

  private static void registerMessageChannel(String id, int nameRes, int descriptionRes) {
    MESSAGE_CHANNEL_IDS.add(id);
    CHANNEL_LABELS.put(id, new int[] {nameRes, descriptionRes});
  }

  /** 이름·설명을 붙이는 메시지·일반 채널 id (등록 순서). */
  static Set<String> labelledChannelIds() {
    return java.util.Collections.unmodifiableSet(CHANNEL_LABELS.keySet());
  }

  /** {이름, 설명} — 앱 언어(S8-1 저장값 → 기기 언어). 모르는 id 는 기본 이름·설명. */
  static String[] labelsFor(Context context, String channelId) {
    int[] res = CHANNEL_LABELS.get(channelId);
    int nameRes = res != null ? res[0] : R.string.dibay_notif_ch_default_name;
    int descRes = res != null ? res[1] : R.string.dibay_notif_ch_default_desc;
    return new String[] {
      DibayNativeLocale.string(context, nameRes), DibayNativeLocale.string(context, descRes)
    };
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
    // D-Q3 — 사용자 알림음·진동 끔 (Android 8+ 소리·진동은 채널 고정). 통화 푸시에는 서버가 soundMode 를 싣지 않는다.
    String mode = soundModeFromFcmData(data);
    if (SOUND_MODE_SILENT.equals(mode)) return SILENT_MESSAGE_CHANNEL_ID;
    boolean noVibrate = SOUND_MODE_NO_VIBRATE.equals(mode);
    String base = resolveBaseMessageChannelIdFromFcmData(data);
    String fallback = noVibrate ? NO_VIBRATE_MESSAGE_CHANNEL_ID : base;
    // W4 — 이벤트별 SSOT 음원 채널(동기화·자산 일치·Android 10+ 일 때만). 진동 끔이면 같은 음원의 진동 없음 변형.
    try {
      String resolved = DibayNotificationSoundChannelStore.resolveChannelForPush(data, base, noVibrate);
      return resolved != null
              && !resolved.trim().isEmpty()
              && !resolved.equals(base)
              && !isCallChannelId(resolved)
          ? resolved
          : fallback;
    } catch (Throwable t) {
      Log.w(TAG, "[fcm] event_sound_channel_resolve_failed → base", t);
      return fallback;
    }
  }

  static final String SOUND_MODE_SILENT = "silent";
  static final String SOUND_MODE_NO_VIBRATE = "no_vibrate";

  /** 서버 {@code soundMode} — 일반 알림 전용. 없거나 모르는 값이면 null. */
  static String soundModeFromFcmData(Map<String, String> data) {
    String mode = data != null ? firstNonEmpty(data.get("soundMode")) : null;
    return SOUND_MODE_SILENT.equals(mode) || SOUND_MODE_NO_VIBRATE.equals(mode) ? mode : null;
  }

  /**
   * D-Q3 — Android 7(API 24·25)은 채널이 없어 알림 자체의 defaults 가 소리·진동을 정한다. Android 8+ 는 채널이
   * 정하므로 이 값은 무시된다. soundMode 가 없으면 기존 {@code DEFAULT_ALL} 그대로.
   */
  public static int legacyNotificationDefaultsForFcmData(Map<String, String> data) {
    String mode = soundModeFromFcmData(data);
    if (SOUND_MODE_SILENT.equals(mode)) return Notification.DEFAULT_LIGHTS;
    if (SOUND_MODE_NO_VIBRATE.equals(mode)) return Notification.DEFAULT_SOUND | Notification.DEFAULT_LIGHTS;
    return Notification.DEFAULT_ALL;
  }

  /** W4 이전 결정 로직 그대로 — 메시지·일반 기본 채널(기본음). */
  static String resolveBaseMessageChannelIdFromFcmData(Map<String, String> data) {
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

    String[] labels = labelsFor(app, channelId);
    String name = labels[0];
    String description = labels[1];

    NotificationChannel channel =
        new NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription(description);
    channel.setShowBadge(true);
    if (SILENT_MESSAGE_CHANNEL_ID.equals(channelId)) {
      channel.setSound(null, null);
      channel.enableVibration(false);
    } else if (NO_VIBRATE_MESSAGE_CHANNEL_ID.equals(channelId)) {
      channel.enableVibration(false);
    } else {
      channel.enableVibration(true);
    }
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
