package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.app.NotificationManager;
import android.content.Context;
import android.os.PowerManager;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadows.ShadowNotificationManager;

/** V4 incoming visible-surface owner policy — one UI per callId on lock/background. */
@RunWith(RobolectricTestRunner.class)
@Config(
    sdk = 34,
    application = Application.class,
    shadows = {IncomingCallNotificationOwnerPolicyTest.ShadowFsiNotificationManager.class})
public class IncomingCallNotificationOwnerPolicyTest {
  /**
   * Robolectric 4.14.1 has no shadow for {@code NotificationManager.canUseFullScreenIntent()} (API 34
   * binder call → false). This shadow lets the test set the FSI permission gate explicitly.
   */
  @Implements(NotificationManager.class)
  public static class ShadowFsiNotificationManager extends ShadowNotificationManager {
    static boolean canUseFullScreenIntent = false;

    @Implementation(minSdk = 34)
    protected boolean canUseFullScreenIntent() {
      return canUseFullScreenIntent;
    }
  }

  private static final String LANE_PREFS = "dibay_call_lane";
  private static final String LANE_KEY = "v4_telegram_lane";

  private Context context;

  @Before
  public void setUp() {
    Application app = ApplicationProvider.getApplicationContext();
    context = app.getApplicationContext();
    app.getSharedPreferences(LANE_PREFS, Context.MODE_PRIVATE).edit().putBoolean(LANE_KEY, true).apply();
    IncomingCallActivity.clearActivityShownEmittedForTests();
    grantLockScreenIncomingGates(app);
  }

  /**
   * Notification permission SSOT LOCK (2a377f1cd · docs/permissions/dibay-notification-permission-ssot.lock.md):
   * FSI attach requires {@link NotificationReceiveGate.Snapshot#lockScreenIncomingReady} — notification
   * permission + notifications enabled + FSI permission + battery-optimization exemption. Owner-policy
   * cases below test the attach path with every gate ON.
   */
  private static void grantLockScreenIncomingGates(Application app) {
    shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
    ShadowFsiNotificationManager.canUseFullScreenIntent = true;
    shadowOf(app.getSystemService(NotificationManager.class)).setNotificationsEnabled(true);
    setBatteryOptimizationIgnored(app, true);
    NotificationReceiveGate.Snapshot gate = NotificationReceiveGate.snapshot(app);
    assertTrue("precondition: notification permission", gate.notificationRuntimeGranted);
    assertTrue("precondition: FSI permission", gate.fullScreenIntentAllowed);
    assertTrue("precondition: battery exemption", gate.batteryOptimizationIgnored);
    assertTrue("precondition: lockScreenIncomingReady", gate.lockScreenIncomingReady);
  }

  private static void setBatteryOptimizationIgnored(Application app, boolean ignored) {
    shadowOf(app.getSystemService(PowerManager.class))
        .setIgnoringBatteryOptimizations(app.getPackageName(), ignored);
  }

  @Test
  public void nativeActivityOwner_allowsVisibleCallStyle() {
    String callId = "owner-native-activity-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY, "test");

    assertFalse(
        IncomingCallNotificationBuilder.shouldBlockVisibleCallStyleForNativeFsiOwner(
            context, callId, false, false));
    assertTrue(
        IncomingCallNotificationBuilder.shouldApplyIncomingCallStyle(context, callId, false, false, true));
    assertTrue(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, false, true, true, true));
  }

  @Test
  public void nativeFsiOwner_blocksVisibleCallStyle() {
    String callId = "owner-native-fsi-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI, "test");

    assertTrue(
        IncomingCallNotificationBuilder.shouldBlockVisibleCallStyleForNativeFsiOwner(
            context, callId, false, false));
    assertFalse(
        IncomingCallNotificationBuilder.shouldApplyIncomingCallStyle(context, callId, false, false, true));
    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, false, true, true, true));
    assertTrue(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, true, true, true, true));
  }

  @Test
  public void notificationFallbackOwner_allowsVisibleCallStyle() {
    String callId = "owner-fallback-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK, "test");

    assertFalse(
        IncomingCallNotificationBuilder.shouldBlockVisibleCallStyleForNativeFsiOwner(
            context, callId, false, false));
    assertTrue(
        IncomingCallNotificationBuilder.shouldApplyIncomingCallStyle(context, callId, false, false, true));
    assertTrue(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, false, true, true, true));
  }

  @Test
  public void actionOnly_neverAttachesFullScreenIntent() {
    String callId = "owner-action-only-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI, "test");

    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, true, false, true, true, true));
    assertFalse(
        IncomingCallNotificationBuilder.shouldApplyIncomingCallStyle(context, callId, true, false, true));
  }

  @Test
  public void activityShownEmitted_dedupesPerCallId() {
    String callId = "dedup-activity-1";
    assertFalse(IncomingCallActivity.wasActivityShownEmittedForTests(callId));
    IncomingCallActivity.markActivityShownEmittedForTests(callId);
    assertTrue(IncomingCallActivity.wasActivityShownEmittedForTests(callId));
    IncomingCallActivity.clearActivityShownEmittedForTests();
    assertFalse(IncomingCallActivity.wasActivityShownEmittedForTests(callId));
  }

  @Test
  public void actionOnly_neverAppliesCallStyle() {
    String callId = "owner-action-only-style-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK, "test");

    assertFalse(
        IncomingCallNotificationBuilder.shouldApplyIncomingCallStyle(context, callId, true, false, true));
    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, true, false, true, true, true));
  }

  @Test
  public void lockScreenGateOff_neverAttachesFullScreenIntent() {
    String callId = "owner-gate-off-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK, "test");
    // Same inputs as notificationFallbackOwner_allowsVisibleCallStyle (attach=true with all gates ON).
    assertTrue(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, false, true, true, true));

    setBatteryOptimizationIgnored(ApplicationProvider.getApplicationContext(), false);
    NotificationReceiveGate.Snapshot gate = NotificationReceiveGate.snapshot(context);
    assertFalse(gate.lockScreenIncomingReady);
    assertEquals("battery_restricted", gate.lockScreenBlockReason);

    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, false, true, true, true));
    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, true, true, true, true));
  }

  @Test
  public void nullContext_neverBlocksCallStylePolicy() {
    assertFalse(
        IncomingCallNotificationBuilder.shouldBlockVisibleCallStyleForNativeFsiOwner(
            null, "any-call", false, false));
  }
}
