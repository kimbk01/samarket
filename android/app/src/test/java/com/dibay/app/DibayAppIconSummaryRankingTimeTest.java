package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 요약 카드(앱 아이콘 숫자 전달)가 시스템 묶음 앞면을 차지하지 않도록 순서 시각을 고정한다
 * (docs/audit/android-notification-aggregate-fix-design-2026-11-04.md).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class DibayAppIconSummaryRankingTimeTest {
  private Context context;
  private NotificationManager nm;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    nm = context.getSystemService(NotificationManager.class);
  }

  private static final long DAY_MS = 24L * 60L * 60L * 1000L;

  /** 14일 초과면 Android 가 게시를 거부(NOTIFICATION_MAX_AGE_AT_POST) · 새 알림보다 오래되려면 과거여야 함 */
  private static void assertWithinPostWindow(long when) {
    long now = System.currentTimeMillis();
    assertTrue("when must be newer than now-14d", when > now - 14L * DAY_MS);
    assertTrue("when must be older than now-12d", when < now - 12L * DAY_MS);
  }

  @Test
  public void summaryRankingWhen_isThirteenDaysBeforeNow() {
    assertEquals(1_000_000_000_000L - 13L * DAY_MS, DibayAppIconDeliveryAdapter.summaryRankingWhenMs(1_000_000_000_000L));
  }

  @Test
  public void summaryCard_hasPastWhenInsidePostWindow_andHidesTime() {
    DibayAppIconDeliveryAdapter.apply(context, 52);
    Notification n = shadowOf(nm).getNotification(DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID);
    assertNotNull(n);
    assertWithinPostWindow(n.when);
    assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_WHEN, true));
    // 숫자 전달은 그대로
    assertEquals(52, n.number);
  }

  @Test
  public void summaryCard_update_keepsWhenInsidePostWindow() {
    DibayAppIconDeliveryAdapter.apply(context, 3);
    DibayAppIconDeliveryAdapter.apply(context, 4);
    Notification n = shadowOf(nm).getNotification(DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID);
    assertNotNull(n);
    assertWithinPostWindow(n.when);
    assertEquals(4, n.number);
  }
}
