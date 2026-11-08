package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** 언어 SSOT S8-4 — 이미 있는 채널 이름·설명 다시 붙이기: 이름·설명만 바뀌고, 없는 채널은 만들지 않는다. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class DibayNotificationChannelLabelsTest {
  private Context app;
  private NotificationManager nm;

  @Before
  public void setUp() {
    app = ApplicationProvider.getApplicationContext();
    nm = app.getSystemService(NotificationManager.class);
    app.getSharedPreferences(DibayAppLanguagePlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    app.getSharedPreferences(DibayNotificationChannelLabels.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    for (NotificationChannel ch : nm.getNotificationChannels()) nm.deleteNotificationChannel(ch.getId());
  }

  private void storeLanguage(String language) {
    app.getSharedPreferences(DibayAppLanguagePlugin.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(DibayAppLanguagePlugin.KEY_LANGUAGE, language)
        .commit();
  }

  @Test
  public void missingChannelIsNotCreated() {
    assertFalse(DibayNotificationChannelLabels.applyLabels(nm, "dibay_trade_v1", "Trades", "x"));
    assertNull(nm.getNotificationChannel("dibay_trade_v1"));
  }

  @Test
  public void sameLabelsSkipUpdate() {
    NotificationChannel ch = new NotificationChannel("dibay_trade_v1", "Trades", NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("d");
    nm.createNotificationChannel(ch);
    assertFalse(DibayNotificationChannelLabels.applyLabels(nm, "dibay_trade_v1", "Trades", "d"));
  }

  @Test
  public void relabelChangesOnlyNameAndDescription() {
    NotificationChannel ch =
        new NotificationChannel("dibay_trade_v1", "거래 알림", NotificationManager.IMPORTANCE_LOW);
    ch.setDescription("거래 채팅·거래 상태 알림");
    ch.enableVibration(false);
    ch.setShowBadge(false);
    ch.setSound(null, null);
    nm.createNotificationChannel(ch);

    // 기기 언어 영어(Robolectric 기본) · 앱 언어 선택 없음 → 영어
    DibayNotificationChannelLabels.relabelIfNeeded(app);

    NotificationChannel after = nm.getNotificationChannel("dibay_trade_v1");
    assertEquals("Trades", after.getName().toString());
    assertEquals("Trade chats and status updates", after.getDescription());
    assertEquals(NotificationManager.IMPORTANCE_LOW, after.getImportance());
    assertFalse(after.shouldVibrate());
    assertFalse(after.canShowBadge());
    assertNull(after.getSound());
  }

  @Test
  public void appLanguageKoreanRelabelsToKoreanAndMarksOnce() {
    NotificationChannel ch =
        new NotificationChannel("dibay_chat_messages_v1", "Chat messages", NotificationManager.IMPORTANCE_HIGH);
    nm.createNotificationChannel(ch);
    storeLanguage("ko");

    DibayNotificationChannelLabels.relabelIfNeeded(app);
    NotificationChannel after = nm.getNotificationChannel("dibay_chat_messages_v1");
    assertEquals("채팅 메시지", after.getName().toString());
    assertEquals("채팅·메신저 메시지 알림", after.getDescription());
    assertEquals(
        DibayNotificationChannelLabels.appliedMark("ko"),
        app.getSharedPreferences(DibayNotificationChannelLabels.PREFS, Context.MODE_PRIVATE)
            .getString(DibayNotificationChannelLabels.KEY_APPLIED, null));

    // 같은 언어·판이면 다시 붙이지 않음 — 사용자가 이름을 다시 바꿔도(가정) 건드리지 않는다
    NotificationChannel renamed = nm.getNotificationChannel("dibay_chat_messages_v1");
    renamed.setName("custom");
    nm.createNotificationChannel(renamed);
    DibayNotificationChannelLabels.relabelIfNeeded(app);
    assertEquals("custom", nm.getNotificationChannel("dibay_chat_messages_v1").getName().toString());
  }

  @Test
  public void newChannelUsesAppLanguage() {
    storeLanguage("ko");
    DibayNotificationChannelRegistry.ensureMessageChannel(app, "dibay_orders_v1");
    NotificationChannel ch = nm.getNotificationChannel("dibay_orders_v1");
    assertEquals("주문 알림", ch.getName().toString());
    assertEquals("스토어·주문 알림", ch.getDescription());
  }

  @Test
  public void soundChannelLabelsPickEnglishOnlyWhenPresent() throws Exception {
    JSONObject rec = new JSONObject().put("label", "가격 제안").put("labelEn", "Price offer");
    NotificationChannel base = new NotificationChannel("dibay_trade_v1", "Trades", NotificationManager.IMPORTANCE_HIGH);
    String[] en = DibayNotificationSoundChannelStore.channelLabels(app, rec, base, false);
    assertEquals("Price offer", en[0]);
    assertEquals("Trades · DIBAY sound", en[1]);
    String[] nv = DibayNotificationSoundChannelStore.channelLabels(app, rec, base, true);
    assertEquals("Price offer · No vibration", nv[0]);

    JSONObject koOnly = new JSONObject().put("label", "가격 제안");
    assertEquals("가격 제안", DibayNotificationSoundChannelStore.channelLabels(app, koOnly, base, false)[0]);

    storeLanguage("ko");
    NotificationChannel baseKo = new NotificationChannel("dibay_trade_v1", "거래 알림", NotificationManager.IMPORTANCE_HIGH);
    String[] ko = DibayNotificationSoundChannelStore.channelLabels(app, rec, baseKo, true);
    assertEquals("가격 제안 · 진동 없음", ko[0]);
    assertEquals("거래 알림 · DIBAY 알림음", ko[1]);
  }

  @Test
  public void callChannelsRelabelOnlyNameAndDescription() {
    NotificationChannel ch =
        new NotificationChannel(
            "dibay_native_voice_incoming_v2", "DIBAY Native Voice", NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("Native Voice Runtime incoming — UI/FSI only (ring via RingOwner)");
    ch.setSound(null, null);
    ch.enableVibration(true);
    nm.createNotificationChannel(ch);
    storeLanguage("ko");

    DibayNotificationChannelLabels.relabelIfNeeded(app);

    NotificationChannel after = nm.getNotificationChannel("dibay_native_voice_incoming_v2");
    assertEquals("음성 통화 수신", after.getName().toString());
    assertEquals("음성 통화가 걸려 올 때 알림", after.getDescription());
    assertEquals(NotificationManager.IMPORTANCE_HIGH, after.getImportance());
    assertTrue(after.shouldVibrate());
    assertNull(after.getSound());
    assertNull(nm.getNotificationChannel("dibay_calls_incoming_v7")); // 없는 통화 채널은 만들지 않음
  }

  @Test
  public void activeCallNotificationDefersCallChannels() {
    nm.createNotificationChannel(
        new NotificationChannel("dibay_calls_incoming_v7", "수신 통화", NotificationManager.IMPORTANCE_HIGH));
    nm.createNotificationChannel(
        new NotificationChannel("dibay_trade_v1", "거래 알림", NotificationManager.IMPORTANCE_HIGH));
    nm.notify(
        4242,
        new androidx.core.app.NotificationCompat.Builder(app, "dibay_calls_incoming_v7")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .build());

    DibayNotificationChannelLabels.relabelIfNeeded(app); // 기기 언어 영어

    assertEquals("Trades", nm.getNotificationChannel("dibay_trade_v1").getName().toString());
    assertEquals("수신 통화", nm.getNotificationChannel("dibay_calls_incoming_v7").getName().toString());
    assertNull(
        app.getSharedPreferences(DibayNotificationChannelLabels.PREFS, Context.MODE_PRIVATE)
            .getString(DibayNotificationChannelLabels.KEY_APPLIED, null));

    nm.cancel(4242);
    DibayNotificationChannelLabels.relabelIfNeeded(app);
    assertEquals("Incoming calls", nm.getNotificationChannel("dibay_calls_incoming_v7").getName().toString());
  }

  @Test
  public void languageFollowsStoredThenDevice() {
    assertEquals("en", DibayNotificationChannelLabels.language(app));
    storeLanguage("ko");
    assertEquals("ko", DibayNotificationChannelLabels.language(app));
    assertTrue(DibayNotificationChannelLabels.appliedMark("en").startsWith("en:"));
  }
}
