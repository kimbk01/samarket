package com.dibay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.nativevideo.NativeVideoCallNotification;
import com.dibay.app.nativevoice.NativeVoiceCallNotification;

/**
 * Notification receive composite gate — SSOT for FCM incoming block (before Native Runtime).
 *
 * <p>Does not modify Native Voice/Video Runtime. Used by {@link IncomingCallPushDelivery} only.
 */
public final class NotificationReceiveGate {
  private static final String TAG = "DIBAY_NOTIF_GATE";

  private NotificationReceiveGate() {}

  public static final class Snapshot {
    public final boolean notificationRuntimeGranted;
    public final boolean notificationsEnabled;
    public final boolean incomingCallChannelEnabled;
    public final boolean legacyIncomingChannelBlocked;
    public final boolean nativeVoiceChannelBlocked;
    public final boolean nativeVideoChannelBlocked;
    public final boolean fullScreenIntentAllowed;
    public final boolean batteryOptimizationIgnored;
    public final boolean receiveReady;
    /** receiveReady AND FSI allowed AND battery not restricted — lock-screen / Activity / FSI tier. */
    public final boolean lockScreenIncomingReady;
    public final String blockReason;
    public final String lockScreenBlockReason;

    Snapshot(
        boolean notificationRuntimeGranted,
        boolean notificationsEnabled,
        boolean incomingCallChannelEnabled,
        boolean legacyIncomingChannelBlocked,
        boolean nativeVoiceChannelBlocked,
        boolean nativeVideoChannelBlocked,
        boolean fullScreenIntentAllowed,
        boolean batteryOptimizationIgnored,
        boolean receiveReady,
        boolean lockScreenIncomingReady,
        String blockReason,
        String lockScreenBlockReason) {
      this.notificationRuntimeGranted = notificationRuntimeGranted;
      this.notificationsEnabled = notificationsEnabled;
      this.incomingCallChannelEnabled = incomingCallChannelEnabled;
      this.legacyIncomingChannelBlocked = legacyIncomingChannelBlocked;
      this.nativeVoiceChannelBlocked = nativeVoiceChannelBlocked;
      this.nativeVideoChannelBlocked = nativeVideoChannelBlocked;
      this.fullScreenIntentAllowed = fullScreenIntentAllowed;
      this.batteryOptimizationIgnored = batteryOptimizationIgnored;
      this.receiveReady = receiveReady;
      this.lockScreenIncomingReady = lockScreenIncomingReady;
      this.blockReason = blockReason;
      this.lockScreenBlockReason = lockScreenBlockReason;
    }
  }

  public static Snapshot snapshot(Context context) {
    Context app = context != null ? context.getApplicationContext() : null;
    if (app == null) {
      return blockedSnapshot(false, false, false, true, true, true, false, true, "no_context", "no_context");
    }

    boolean runtimeGranted =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(app, android.Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    boolean appEnabled = NotificationManagerCompat.from(app).areNotificationsEnabled();
    boolean legacyBlocked = IncomingCallNotificationBuilder.isIncomingChannelBlocked(app);
    boolean voiceBlocked = isChannelBlocked(app, NativeVoiceCallNotification.CHANNEL_ID);
    boolean videoBlocked = isChannelBlocked(app, NativeVideoCallNotification.CHANNEL_ID);
    boolean anyIncomingChannelEnabled = !legacyBlocked || !voiceBlocked || !videoBlocked;
    boolean fsiAllowed = IncomingCallNotificationBuilder.canPostFullScreenIntent(app);
    boolean batteryIgnored = isBatteryOptimizationIgnored(app);

    String blockReason = null;
    if (!runtimeGranted) {
      blockReason = "runtime_permission";
    } else if (!appEnabled) {
      blockReason = "app_notifications_disabled";
    } else if (!anyIncomingChannelEnabled) {
      blockReason = "incoming_channel_disabled";
    }

    boolean receiveReady = blockReason == null;

    String lockScreenBlockReason = null;
    if (!receiveReady) {
      lockScreenBlockReason = blockReason;
    } else if (!fsiAllowed) {
      lockScreenBlockReason = "full_screen_intent_disabled";
    } else if (!batteryIgnored) {
      lockScreenBlockReason = "battery_restricted";
    }
    boolean lockScreenIncomingReady = lockScreenBlockReason == null;

    return new Snapshot(
        runtimeGranted,
        appEnabled,
        anyIncomingChannelEnabled,
        legacyBlocked,
        voiceBlocked,
        videoBlocked,
        fsiAllowed,
        batteryIgnored,
        receiveReady,
        lockScreenIncomingReady,
        blockReason,
        lockScreenBlockReason);
  }

  /** Returns true when incoming call delivery may proceed to Native Runtime. */
  public static boolean canReceiveIncomingCall(Context context) {
    return snapshot(context).receiveReady;
  }

  /** Lock-screen FSI / Activity / fallback tier — FSI is never part of {@link #receiveReady}. */
  public static boolean canPresentLockScreenIncoming(Context context) {
    return snapshot(context).lockScreenIncomingReady;
  }

  private static Snapshot blockedSnapshot(
      boolean runtimeGranted,
      boolean appEnabled,
      boolean incomingChannelEnabled,
      boolean legacyBlocked,
      boolean voiceBlocked,
      boolean videoBlocked,
      boolean fsiAllowed,
      boolean batteryIgnored,
      String reason,
      String lockReason) {
    return new Snapshot(
        runtimeGranted,
        appEnabled,
        incomingChannelEnabled,
        legacyBlocked,
        voiceBlocked,
        videoBlocked,
        fsiAllowed,
        batteryIgnored,
        false,
        false,
        reason,
        lockReason);
  }

  private static boolean isChannelBlocked(Context context, String channelId) {
    if (context == null || channelId == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return false;
    }
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    NotificationChannel channel = nm != null ? nm.getNotificationChannel(channelId) : null;
    return channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE;
  }

  private static boolean isBatteryOptimizationIgnored(Context context) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
    try {
      PowerManager pm = context.getSystemService(PowerManager.class);
      return pm == null || pm.isIgnoringBatteryOptimizations(context.getPackageName());
    } catch (Exception ignored) {
      return true;
    }
  }
}
