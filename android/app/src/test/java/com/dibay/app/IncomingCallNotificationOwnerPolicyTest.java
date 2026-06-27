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
import org.robolectric.annotation.Config;

/** V4 incoming visible-surface owner policy — one UI per callId on lock/background. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
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
