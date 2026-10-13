package com.dibay.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

/**
 * V4 incoming visible-surface owner policy — one UI per callId on lock/background.
 *
 * <p>SDK 33: Robolectric 4.14.1 backs NotificationManager with a null binder proxy and has no shadow for
 * {@code canUseFullScreenIntent()}, so on SDK 34 it is always false and the lock-screen tier can never be
 * ready. On SDK 33 FSI is install-time granted ({@code canPostFullScreenIntent} returns true), while
 * POST_NOTIFICATIONS is still a runtime permission, so the receive gate is still exercised.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class)
public class IncomingCallNotificationOwnerPolicyTest {
  private static final String LANE_PREFS = "dibay_call_lane";
  private static final String LANE_KEY = "v4_telegram_lane";

  private Context context;

  @Before
  public void setUp() {
    Application app = ApplicationProvider.getApplicationContext();
    context = app.getApplicationContext();
    app.getSharedPreferences(LANE_PREFS, Context.MODE_PRIVATE).edit().putBoolean(LANE_KEY, true).apply();
    IncomingCallActivity.clearActivityShownEmittedForTests();
    // Owner policy is evaluated on a device whose lock-screen tier is ready
    // (NotificationReceiveGate.lockScreenIncomingReady): POST_NOTIFICATIONS granted, FSI allowed
    // (install-time on SDK 33), battery optimisation ignored. Robolectric's default device has none of these.
    setLockScreenIncomingReady(true);
  }

  private void setLockScreenIncomingReady(boolean ready) {
    Application app = ApplicationProvider.getApplicationContext();
    if (ready) {
      Shadows.shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
    } else {
      Shadows.shadowOf(app).denyPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
    }
    Shadows.shadowOf(app.getSystemService(android.os.PowerManager.class))
        .setIgnoringBatteryOptimizations(app.getPackageName(), ready);
  }

  @Test
  public void lockScreenTierNotReady_neverAttachesFullScreenIntent() {
    String callId = "owner-gate-blocked-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY, "test");
    setLockScreenIncomingReady(false);

    assertFalse(NotificationReceiveGate.snapshot(context).lockScreenIncomingReady);
    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, false, true, true, true));
    assertFalse(
        IncomingCallNotificationBuilder.shouldAttachIncomingFullScreenIntent(
            context, callId, false, true, true, true, true));
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
  public void nullContext_neverBlocksCallStylePolicy() {
    assertFalse(
        IncomingCallNotificationBuilder.shouldBlockVisibleCallStyleForNativeFsiOwner(
            null, "any-call", false, false));
  }
}
