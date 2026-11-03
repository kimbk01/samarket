package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
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

  @Test
  public void summaryCard_hasFixedPastWhen_andHidesTime() {
    DibayAppIconDeliveryAdapter.apply(context, 52);
    Notification n = shadowOf(nm).getNotification(DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID);
    assertNotNull(n);
    assertEquals(1L, n.when);
    assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_WHEN, true));
    // 숫자 전달은 그대로
    assertEquals(52, n.number);
  }

  @Test
  public void summaryCard_update_keepsFixedWhen() {
    DibayAppIconDeliveryAdapter.apply(context, 3);
    DibayAppIconDeliveryAdapter.apply(context, 4);
    Notification n = shadowOf(nm).getNotification(DibayAppIconDeliveryAdapter.SUMMARY_NOTIFICATION_ID);
    assertNotNull(n);
    assertEquals(1L, n.when);
    assertEquals(4, n.number);
  }
}
