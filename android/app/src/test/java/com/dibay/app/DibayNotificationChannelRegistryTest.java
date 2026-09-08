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
    assertFalse(DibayNotificationChannelRegistry.isAllowedMessageChannelId("dibay_native_voice_incoming"));
  }
}
