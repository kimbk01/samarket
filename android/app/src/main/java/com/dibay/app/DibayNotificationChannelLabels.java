package com.dibay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import java.util.Locale;
import java.util.Objects;

/**
 * 언어 SSOT S8-4 — 이미 만들어진 알림 채널에 지금 언어의 이름·설명을 다시 붙인다
 * (docs/audit/i18n-s8-native-plan-2026-11-08.md §15).
 *
 * <p>채널 생성 코드는 「없을 때만」 만들므로 문구만 바꾸면 이미 설치된 휴대폰은 옛 이름이 남는다. 공식 문서
 * {@code NotificationManager.createNotificationChannel}: 로캘이 바뀌면 이름·설명을 다시 등록하라, 그 밖의 필드는 이미
 * 있는 채널에서 무시된다. 그래서 <b>시스템이 돌려준 채널 객체 그대로</b> 이름·설명만 바꿔 다시 등록한다(중요도·소리·진동·
 * 배지·잠금 화면 = 그 객체의 현재 값 = 변화 없음). 지워진 채널은 {@code getNotificationChannel} 이 null 이라 건너뛴다
 * (다시 등록하면 되살아나므로).
 */
public final class DibayNotificationChannelLabels {
  private static final String TAG = "DIBAY_NOTIF_LABEL";
  static final String PREFS = "dibay_notification_channel_labels";
  static final String KEY_APPLIED = "applied";
  /** 문구 판 — 채널 이름·설명 문구를 바꾸면 올린다(설치된 휴대폰에서 한 번 다시 붙이게). */
  static final int LABELS_VERSION = 1;

  private DibayNotificationChannelLabels() {}

  /** 지금 문구 언어 "ko"·"en" — 앱에서 고른 언어 → 없으면 기기 언어(ko 외 → en). */
  static String language(Context context) {
    String device = "";
    try {
      if (context != null && !context.getResources().getConfiguration().getLocales().isEmpty()) {
        device = context.getResources().getConfiguration().getLocales().get(0).getLanguage();
      } else {
        device = Locale.getDefault().getLanguage();
      }
    } catch (RuntimeException ignored) {
      device = Locale.getDefault().getLanguage();
    }
    String stored = context != null ? DibayAppLanguagePlugin.storedLanguage(context) : null;
    String override = DibayNativeLocale.overrideLanguage(stored, device);
    if (override != null) return override;
    return "ko".equals(device) ? "ko" : "en";
  }

  static String appliedMark(String language) {
    return language + ":" + LABELS_VERSION;
  }

  /** 이름·설명이 다를 때만 다시 등록. 채널이 없으면(지워짐 포함) 아무것도 하지 않음. */
  static boolean applyLabels(NotificationManager nm, String channelId, String name, String description) {
    if (nm == null || channelId == null || name == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return false;
    }
    NotificationChannel existing = nm.getNotificationChannel(channelId);
    if (existing == null) return false;
    String currentName = existing.getName() != null ? existing.getName().toString() : null;
    if (Objects.equals(currentName, name) && Objects.equals(existing.getDescription(), description)) {
      return false;
    }
    existing.setName(name);
    existing.setDescription(description);
    nm.createNotificationChannel(existing);
    return true;
  }

  /** 앱 시작·앱 언어 변경 때. 마지막으로 붙인 언어·문구 판과 같으면 바로 끝. */
  public static void relabelIfNeeded(Context context) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    try {
      Context app = context.getApplicationContext() != null ? context.getApplicationContext() : context;
      String mark = appliedMark(language(app));
      SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      if (mark.equals(prefs.getString(KEY_APPLIED, null))) return;
      NotificationManager nm = app.getSystemService(NotificationManager.class);
      if (nm == null) return;
      int changed = relabelAll(app, nm);
      // 통화 알림이 떠 있으면(수신·통화 중) 통화 채널은 건드리지 않고 다음 시작 때 다시 — 판을 저장하지 않는다
      if (hasActiveCallNotification(nm)) {
        Log.i(TAG, "[relabel] call_channels_deferred mark=" + mark + " changed=" + changed);
        return;
      }
      changed += relabelCallChannels(app, nm);
      prefs.edit().putString(KEY_APPLIED, mark).apply();
      Log.i(TAG, "[relabel] mark=" + mark + " changed=" + changed);
    } catch (RuntimeException error) {
      Log.w(TAG, "[relabel] failed", error);
    }
  }

  /** 언어 SSOT S8-4b — 통화 채널 {채널 id, 이름 리소스, 설명 리소스}. 옛 채널 id 는 대상 아님(코드가 지우거나 쓰지 않음). */
  static final Object[][] CALL_CHANNEL_LABELS = {
    {IncomingCallNotificationBuilder.CHANNEL_ID, R.string.dibay_call_ch_incoming_name, R.string.dibay_call_ch_incoming_desc},
    {MissedCallNotificationHelper.CHANNEL_ID, R.string.dibay_call_ch_missed_name, R.string.dibay_call_ch_missed_desc},
    {com.dibay.app.call.CallForegroundService.CHANNEL_ID, R.string.dibay_call_ch_active_name, R.string.dibay_call_ch_active_desc},
    {com.dibay.app.nativevoice.NativeVoiceCallNotification.CHANNEL_ID, R.string.dibay_call_ch_voice_incoming_name, R.string.dibay_call_ch_voice_incoming_desc},
    {com.dibay.app.nativevideo.NativeVideoCallNotification.CHANNEL_ID, R.string.dibay_call_ch_video_incoming_name, R.string.dibay_call_ch_video_incoming_desc},
    {com.dibay.app.nativevoice.NativeVoiceCallService.CHANNEL_ID, R.string.dibay_call_ch_voice_ongoing_name, R.string.dibay_call_ch_voice_ongoing_desc},
    {com.dibay.app.nativevideo.NativeVideoCallService.CHANNEL_ID, R.string.dibay_call_ch_video_ongoing_name, R.string.dibay_call_ch_video_ongoing_desc},
  };

  /** 지금 통화 채널 알림(수신 벨·통화 중 표시)이 떠 있는가 — 읽기만 한다. 부재중 알림은 오래 남으므로 제외. */
  static boolean hasActiveCallNotification(NotificationManager nm) {
    try {
      for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
        String channelId = sbn.getNotification() != null ? sbn.getNotification().getChannelId() : null;
        if (channelId == null || channelId.startsWith("dibay_calls_missed")) continue;
        if (DibayNotificationChannelRegistry.isCallChannelId(channelId)) return true;
      }
    } catch (RuntimeException error) {
      return true; // 모르면 통화 채널은 건드리지 않는다
    }
    return false;
  }

  static int relabelCallChannels(Context app, NotificationManager nm) {
    int changed = 0;
    for (Object[] row : CALL_CHANNEL_LABELS) {
      if (applyLabels(
          nm,
          (String) row[0],
          DibayNativeLocale.string(app, (Integer) row[1]),
          DibayNativeLocale.string(app, (Integer) row[2]))) {
        changed++;
      }
    }
    return changed;
  }

  static int relabelAll(Context app, NotificationManager nm) {
    int changed = 0;
    for (String id : DibayNotificationChannelRegistry.labelledChannelIds()) {
      String[] labels = DibayNotificationChannelRegistry.labelsFor(app, id);
      if (applyLabels(nm, id, labels[0], labels[1])) changed++;
    }
    if (applyLabels(
        nm,
        DibayAppIconDeliveryAdapter.SUMMARY_CHANNEL_ID,
        DibayNativeLocale.string(app, R.string.dibay_notif_ch_app_icon_name),
        DibayNativeLocale.string(app, R.string.dibay_notif_ch_app_icon_desc))) {
      changed++;
    }
    // 알림음 채널 설명은 기본 채널 이름을 쓰므로 기본 채널 다음에.
    changed += DibayNotificationSoundChannelStore.relabelChannels(app, nm);
    return changed;
  }
}
