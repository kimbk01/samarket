package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** W4 — 이벤트 음원 채널: 실패·미동기화·불일치·통화 이벤트는 항상 기존 기본 채널로 fallback. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class)
public class DibayNotificationSoundChannelStoreTest {
  private Context context;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    DibayNotificationSoundChannelStore.resetForTest(context);
  }

  @After
  public void tearDown() {
    DibayNotificationSoundChannelStore.resetForTest(null);
  }

  private static Map<String, String> fcm(String eventKey, String assetId, String channel) {
    Map<String, String> d = new HashMap<>();
    if (eventKey != null) d.put("eventKey", eventKey);
    if (assetId != null) d.put("soundAssetId", assetId);
    if (channel != null) d.put("androidChannelId", channel);
    return d;
  }

  private void seedRecord(String eventKey, String assetId, String baseChannelId) throws Exception {
    JSONObject rec = new JSONObject();
    rec.put("eventKey", eventKey);
    rec.put("assetId", assetId);
    rec.put("url", "https://example.invalid/a.mp3");
    rec.put("uri", "content://media/external_primary/audio/media/999999");
    rec.put("baseChannelId", baseChannelId);
    rec.put("version", 1);
    rec.put("channelId", DibayNotificationSoundChannelStore.channelIdFor(eventKey, 1));
    JSONObject all = new JSONObject();
    all.put(eventKey, rec);
    context
        .getSharedPreferences(DibayNotificationSoundChannelStore.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(DibayNotificationSoundChannelStore.KEY_RECORDS, all.toString())
        .commit();
  }

  @Test
  public void helpers() {
    assertTrue(DibayNotificationSoundChannelStore.isEligibleEventKey("messenger_direct_message_received"));
    assertFalse(DibayNotificationSoundChannelStore.isEligibleEventKey("call_voice_incoming"));
    assertFalse(DibayNotificationSoundChannelStore.isEligibleEventKey("Bad-Key"));
    assertFalse(DibayNotificationSoundChannelStore.isEligibleEventKey(""));
    assertEquals(
        "dibay_ev_trade_offer_received_v3",
        DibayNotificationSoundChannelStore.channelIdFor("trade_offer_received", 3));
    assertEquals("audio/wav", DibayNotificationSoundChannelStore.mimeTypeForUrl("https://x/a.WAV?t=1"));
    assertEquals("audio/mpeg", DibayNotificationSoundChannelStore.mimeTypeForUrl("https://x/a"));
  }

  @Test
  public void noRecord_returnsBase() {
    assertEquals(
        "dibay_trade_v1",
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1")));
  }

  @Test
  public void missingEventOrAsset_returnsBase() throws Exception {
    seedRecord("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1");
    assertEquals(
        "dibay_trade_v1",
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm(null, "DIBAY-SND-010", "dibay_trade_v1")));
    assertEquals(
        "dibay_trade_v1",
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm("trade_offer_received", null, "dibay_trade_v1")));
  }

  @Test
  public void assetMismatch_returnsBase() throws Exception {
    seedRecord("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1");
    assertEquals(
        "dibay_trade_v1",
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm("trade_offer_received", "DIBAY-SND-OTHER", "dibay_trade_v1")));
  }

  @Test
  public void mediaMissing_returnsBase_withoutCreatingChannel() throws Exception {
    seedRecord("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1");
    assertEquals(
        "dibay_trade_v1",
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1")));
    android.app.NotificationManager nm = context.getSystemService(android.app.NotificationManager.class);
    assertEquals(null, nm.getNotificationChannel("dibay_ev_trade_offer_received_v1"));
  }

  @Test
  public void callEvent_neverUsesEventChannel() throws Exception {
    seedRecord("call_voice_incoming", "DIBAY-SND-040", "dibay_chat_messages_v1");
    assertEquals(
        DibayNotificationChannelRegistry.DEFAULT_MESSAGE_CHANNEL_ID,
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm("call_voice_incoming", "DIBAY-SND-040", "dibay_native_voice_incoming_v2")));
  }

  @Test
  public void sync_skipsCallKeysAndInvalidBase_andKeepsNoRecordForEmptyUrl() throws Exception {
    JSONArray entries = new JSONArray();
    entries.put(new JSONObject().put("eventKey", "call_voice_incoming").put("assetId", "A").put("url", "https://x/a.mp3").put("baseChannelId", "dibay_chat_messages_v1"));
    entries.put(new JSONObject().put("eventKey", "trade_offer_received").put("assetId", "A").put("url", "https://x/a.mp3").put("baseChannelId", "dibay_native_voice_incoming_v2"));
    entries.put(new JSONObject().put("eventKey", "community_mention_received").put("assetId", "").put("url", "").put("baseChannelId", "dibay_community_v1"));
    JSONObject summary = DibayNotificationSoundChannelStore.syncEventSounds(context, entries);
    assertEquals(2, summary.optInt("skipped"));
    assertEquals(1, summary.optInt("unchanged"));
    assertEquals(0, summary.optInt("updated"));
  }

  @Test
  @Config(sdk = 28)
  public void preQ_syncIsNoop_andResolveReturnsBase() throws Exception {
    JSONObject summary = DibayNotificationSoundChannelStore.syncEventSounds(context, new JSONArray());
    assertEquals("pre_q_default_sound", summary.optString("reason"));
    seedRecord("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1");
    assertEquals(
        "dibay_trade_v1",
        DibayNotificationChannelRegistry.resolveMessageChannelIdFromFcmData(
            fcm("trade_offer_received", "DIBAY-SND-010", "dibay_trade_v1")));
  }
}
