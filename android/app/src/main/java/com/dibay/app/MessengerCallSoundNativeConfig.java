package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Web `fetchMessengerCallSoundConfig` → native incoming ring SSOT (APK). */
public final class MessengerCallSoundNativeConfig {
  private static final String PREFS = "dibay_messenger_call_sound_config";

  private static final String VOICE_INCOMING_ENABLED = "voice_incoming_enabled";
  private static final String VOICE_INCOMING_SOURCE = "voice_incoming_source";
  private static final String VOICE_INCOMING_URL = "voice_incoming_url";
  private static final String VIDEO_INCOMING_ENABLED = "video_incoming_enabled";
  private static final String VIDEO_INCOMING_SOURCE = "video_incoming_source";
  private static final String VIDEO_INCOMING_URL = "video_incoming_url";

  public static final class IncomingSound {
    public final boolean enabled;
    public final String source;
    public final String url;

    IncomingSound(boolean enabled, String source, String url) {
      this.enabled = enabled;
      this.source = source != null ? source : "device_ringtone";
      this.url = url != null ? url : "";
    }
  }

  private MessengerCallSoundNativeConfig() {}

  public static void syncFromWeb(
      Context context,
      boolean voiceIncomingEnabled,
      String voiceIncomingSource,
      String voiceIncomingUrl,
      boolean videoIncomingEnabled,
      String videoIncomingSource,
      String videoIncomingUrl) {
    if (context == null) return;
    SharedPreferences p = prefs(context);
    p.edit()
        .putBoolean(VOICE_INCOMING_ENABLED, voiceIncomingEnabled)
        .putString(VOICE_INCOMING_SOURCE, normalizeSource(voiceIncomingSource))
        .putString(VOICE_INCOMING_URL, voiceIncomingUrl != null ? voiceIncomingUrl.trim() : "")
        .putBoolean(VIDEO_INCOMING_ENABLED, videoIncomingEnabled)
        .putString(VIDEO_INCOMING_SOURCE, normalizeSource(videoIncomingSource))
        .putString(VIDEO_INCOMING_URL, videoIncomingUrl != null ? videoIncomingUrl.trim() : "")
        .apply();
  }

  public static IncomingSound resolveIncoming(Context context, boolean isVideo) {
    SharedPreferences p = prefs(context);
    if (isVideo) {
      return new IncomingSound(
          p.getBoolean(VIDEO_INCOMING_ENABLED, true),
          p.getString(VIDEO_INCOMING_SOURCE, "device_ringtone"),
          p.getString(VIDEO_INCOMING_URL, ""));
    }
    return new IncomingSound(
        p.getBoolean(VOICE_INCOMING_ENABLED, true),
        p.getString(VOICE_INCOMING_SOURCE, "device_ringtone"),
        p.getString(VOICE_INCOMING_URL, ""));
  }

  private static String normalizeSource(String source) {
    if (source == null) return "device_ringtone";
    String s = source.trim();
    return "admin_custom".equals(s) ? "admin_custom" : "device_ringtone";
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
