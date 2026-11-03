package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
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
 * 숫자 표시 런처 합(요약 카드 number + 일반 알림마다 max(1, number)) = 총수가 되게
 * (docs/audit/app-icon-badge-plus1-proof-and-design-2026-11-04.md).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class DibayAppIconTrayAwareNumberTest {
  private Context context;
  private NotificationManager nm;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    nm = context.getSystemService(NotificationManager.class);
    nm.createNotificationChannel(new NotificationChannel("t", "t", NotificationManager.IMPORTANCE_HIGH));
  }

  private void postDomain(int id, int number, boolean ongoing) {
    Notification n =
        new NotificationCompat.Builder(context, "t")
            .setSmallIcon(R.drawable.ic_stat_dibay)
            .setContentTitle("t" + id)
            .setNumber(number)
            .setOngoing(ongoing)
            .build();
    nm.notify(id, n);
  }

  private Notification summary() {
    return shadowOf(nm).getNotification(DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID);
  }

  /** 런처 합 — 요약 카드 number + 상주·묶음 머리 아닌 다른 알림마다 max(1, number) */
  private int launcherSum() {
    int sum = 0;
    for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
      Notification n = sbn.getNotification();
      if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) continue;
      sum += Math.max(1, n.number);
    }
    return sum;
  }

  @Test
  public void noTray_summaryCarriesTotal() {
    DibayAppIconDeliveryAdapter.apply(context, 60);
    assertEquals(60, summary().number);
    assertEquals(60, launcherSum());
  }

  @Test
  public void oneDomainCard_summaryIsTotalMinusOne_sumIsTotal() {
    postDomain(101, 0, false);
    DibayAppIconDeliveryAdapter.apply(context, 60);
    assertEquals(59, summary().number);
    assertEquals(60, launcherSum());
  }

  @Test
  public void domainCardWithNumber_countsItsNumber() {
    postDomain(102, 3, false);
    DibayAppIconDeliveryAdapter.apply(context, 10);
    assertEquals(7, summary().number);
    assertEquals(10, launcherSum());
  }

  @Test
  public void ongoingCard_notCounted() {
    postDomain(103, 0, true);
    DibayAppIconDeliveryAdapter.apply(context, 5);
    assertEquals(5, summary().number);
  }

  @Test
  public void trayCoversTotal_summaryWithheld() {
    postDomain(104, 0, false);
    postDomain(105, 0, false);
    DibayAppIconDeliveryAdapter.apply(context, 2);
    assertNull(summary());
  }

  @Test
  public void dismissedCard_excludedOnReapply_summaryRestored() {
    postDomain(106, 0, false);
    DibayAppIconDeliveryAdapter.apply(context, 1);
    assertNull(summary());
    // 회원이 106 을 지움 — 목록에 아직 남아 있어도 그 id 를 빼고 계산
    DibayAppIconDeliveryAdapter.reapplyLast(context, 106);
    assertNotNull(summary());
    assertEquals(1, summary().number);
  }

  @Test
  public void zeroTotal_clearsSummary() {
    DibayAppIconDeliveryAdapter.apply(context, 4);
    DibayAppIconDeliveryAdapter.apply(context, 0);
    assertNull(summary());
  }

  @Test
  public void summaryNumberFor_isTotalMinusTray() {
    assertEquals(59, DibayAppIconDeliveryAdapter.summaryNumberFor(60, 1));
    assertEquals(60, DibayAppIconDeliveryAdapter.summaryNumberFor(60, 0));
    assertEquals(0, DibayAppIconDeliveryAdapter.summaryNumberFor(2, 2));
  }
}
