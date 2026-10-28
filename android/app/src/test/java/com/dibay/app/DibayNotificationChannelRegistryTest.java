package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import androidx.test.core.app.ApplicationProvider;
import java.util.HashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class DibayNotificationChannelRegistryTest {
  private Context context;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
  }

  @Test
  public void resolveMessageChannelId_usesSsotFromFcmData() {
    Map<String, String> data = new HashMap<>();
    data.put("androidChannelId", "dibay_trade_v1");
    assertEquals("dibay_trade_v1", DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(data));
  }

  @Test
  public void resolveMessageChannelId_rejectsIncomingCallChannel() {
    Map<String, String> data = new HashMap<>();
    data.put("androidChannelId", "dibay_calls_incoming_v7");
    assertEquals(
        DibayNotificationChannelRegistry.DEFAULT_MESSAGE_CHANNEL_ID,
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(data));
  }

  @Test
  public void resolveMessageChannelId_rejectsMissedCallChannel() {
    Map<String, String> data = new HashMap<>();
    data.put("android_channel_id", "dibay_calls_missed_v1");
    assertEquals(
        DibayNotificationChannelRegistry.DEFAULT_MESSAGE_CHANNEL_ID,
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(data));
  }

  @Test
  public void resolveMessageChannelId_fallbackWhenMissing() {
    assertEquals(
        DibayNotificationChannelRegistry.DEFAULT_MESSAGE_CHANNEL_ID,
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(new HashMap<>()));
  }

  @Test
  public void ensureMessageChannel_createsSsotChannel() {
    String id = DibayNotificationChannelRegistry.ensureMessageChannel(context, "dibay_delivery_v1");
    assertEquals("dibay_delivery_v1", id);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager nm = context.getSystemService(NotificationManager.class);
      assertTrue(nm.getNotificationChannel("dibay_delivery_v1") != null);
    }
  }

  @Test
  public void isCallChannelId_detectsNativeVoiceIncoming() {
    assertTrue(DibayNotificationChannelRegistry.isCallChannelId("dibay_native_voice_incoming"));
    assertTrue(DibayNotificationChannelRegistry.isCallChannelId("dibay_native_voice_incoming_v2"));
    assertTrue(DibayNotificationChannelRegistry.isCallChannelId("dibay_native_video_incoming_v2"));
    assertFalse(DibayNotificationChannelRegistry.isAllowedMessageChannelId("dibay_native_voice_incoming"));
    assertFalse(DibayNotificationChannelRegistry.isAllowedMessageChannelId("dibay_native_voice_incoming_v2"));
  }

  @Test
  public void resolveMessageChannelId_soundModeSilentUsesSilentChannel() {
    Map<String, String> data = new HashMap<>();
    data.put("androidChannelId", "dibay_trade_v1");
    data.put("soundMode", "silent");
    assertEquals(
        DibayNotificationChannelRegistry.SILENT_MESSAGE_CHANNEL_ID,
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(data));
  }

  @Test
  public void resolveMessageChannelId_soundModeNoVibrateUsesNoVibrateChannel() {
    Map<String, String> data = new HashMap<>();
    data.put("soundMode", "no_vibrate");
    assertEquals(
        DibayNotificationChannelRegistry.NO_VIBRATE_MESSAGE_CHANNEL_ID,
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(data));
  }

  @Test
  public void resolveMessageChannelId_unknownSoundModeKeepsBaseChannel() {
    Map<String, String> data = new HashMap<>();
    data.put("androidChannelId", "dibay_trade_v1");
    data.put("soundMode", "loud");
    assertEquals("dibay_trade_v1", DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(data));
  }

  @Test
  public void quietChannels_areNotCallChannels() {
    assertFalse(DibayNotificationChannelRegistry.isCallChannelId(DibayNotificationChannelRegistry.SILENT_MESSAGE_CHANNEL_ID));
    assertFalse(DibayNotificationChannelRegistry.isCallChannelId(DibayNotificationChannelRegistry.NO_VIBRATE_MESSAGE_CHANNEL_ID));
  }

  @Test
  public void ensureMessageChannel_silentChannelHasNoSoundNoVibration() {
    String id =
        DibayNotificationChannelRegistry.ensureMessageChannel(
            context, DibayNotificationChannelRegistry.SILENT_MESSAGE_CHANNEL_ID);
    assertEquals(DibayNotificationChannelRegistry.SILENT_MESSAGE_CHANNEL_ID, id);
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    android.app.NotificationChannel ch = nm.getNotificationChannel(id);
    assertTrue(ch != null);
    assertTrue(ch.getSound() == null);
    assertFalse(ch.shouldVibrate());
  }

  @Test
  public void ensureMessageChannel_noVibrateChannelKeepsSoundWithoutVibration() {
    String id =
        DibayNotificationChannelRegistry.ensureMessageChannel(
            context, DibayNotificationChannelRegistry.NO_VIBRATE_MESSAGE_CHANNEL_ID);
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    android.app.NotificationChannel ch = nm.getNotificationChannel(id);
    assertTrue(ch != null);
    assertTrue(ch.getSound() != null);
    assertFalse(ch.shouldVibrate());
  }

  @Test
  public void legacyDefaults_followSoundMode() {
    Map<String, String> data = new HashMap<>();
    assertEquals(
        android.app.Notification.DEFAULT_ALL,
        DibayNotificationChannelRegistry.legacyNotificationDefaultsForFcmData(data));
    assertEquals(
        android.app.Notification.DEFAULT_ALL,
        DibayNotificationChannelRegistry.legacyNotificationDefaultsForFcmData(null));
    data.put("soundMode", "silent");
    assertEquals(
        android.app.Notification.DEFAULT_LIGHTS,
        DibayNotificationChannelRegistry.legacyNotificationDefaultsForFcmData(data));
    data.put("soundMode", "no_vibrate");
    assertEquals(
        android.app.Notification.DEFAULT_SOUND | android.app.Notification.DEFAULT_LIGHTS,
        DibayNotificationChannelRegistry.legacyNotificationDefaultsForFcmData(data));
  }
}
