package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertSame;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import androidx.core.app.NotificationCompat;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 같은 값이면 요약 카드를 다시 게시하지 않는다 — 게시(갱신)마다 제조사 시스템 UI 가 화면 켜기를 다시 판단한다
 * (docs/audit/xiaomi-badge-summary-wake-audit-2026-11-17.md §3·§5 R1).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class DibayAppIconSummaryIdempotentTest {
  private Context context;
  private NotificationManager nm;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    nm = context.getSystemService(NotificationManager.class);
    nm.createNotificationChannel(new NotificationChannel("t", "t", NotificationManager.IMPORTANCE_HIGH));
  }

  private Notification summary() {
    return shadowOf(nm).getNotification(DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID);
  }

  private void postDomain(int id) {
    nm.notify(
        id,
        new NotificationCompat.Builder(context, "t")
            .setSmallIcon(R.drawable.ic_stat_dibay)
            .setContentTitle("t" + id)
            .build());
  }

  @Test
  public void sameTotal_reapplyAndBackground_doNotRepost() {
    DibayAppIconDeliveryAdapter.apply(context, 64);
    Notification first = summary();
    assertNotNull(first);
    assertEquals(64, first.number);

    DibayAppIconDeliveryAdapter.apply(context, 64);
    DibayAppIconDeliveryAdapter.reapplyLast(context); // 앱 백그라운드 전환(onStop) 경로
    assertSame(first, summary());
  }

  @Test
  public void totalChanged_reposts() {
    DibayAppIconDeliveryAdapter.apply(context, 64);
    Notification first = summary();
    DibayAppIconDeliveryAdapter.apply(context, 65);
    Notification second = summary();
    assertNotSame(first, second);
    assertEquals(65, second.number);
  }

  @Test
  public void trayChanged_reposts_thenSameAgain_doesNotRepost() {
    DibayAppIconDeliveryAdapter.apply(context, 10);
    Notification first = summary();
    postDomain(1);
    DibayAppIconDeliveryAdapter.reapplyLast(context);
    Notification second = summary();
    assertNotSame(first, second);
    assertEquals(9, second.number);
    DibayAppIconDeliveryAdapter.reapplyLast(context);
    assertSame(second, summary());
  }

  @Test
  public void withheldThenRestored_reposts() {
    DibayAppIconDeliveryAdapter.apply(context, 1);
    postDomain(1);
    DibayAppIconDeliveryAdapter.reapplyLast(context);
    assertEquals(null, summary()); // 일반 알림만으로 총수 → 요약 카드 보류
    nm.cancel(1);
    DibayAppIconDeliveryAdapter.reapplyLast(context);
    assertNotNull(summary());
    assertEquals(1, summary().number);
  }
}
