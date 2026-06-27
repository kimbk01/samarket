package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** V4 — ring SSOT is callId-scoped RingOwner; surface owner duplicate must not block ring. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class IncomingCallRingOwnerContractTest {
  private static final String LANE_PREFS = "dibay_call_lane";
  private static final String LANE_KEY = "v4_telegram_lane";

  private Context context;

  @Before
  public void setUp() {
    Application app = ApplicationProvider.getApplicationContext();
    context = app.getApplicationContext();
    app.getSharedPreferences(LANE_PREFS, Context.MODE_PRIVATE).edit().putBoolean(LANE_KEY, true).apply();
    IncomingCallRingOwner.clearForTests();
  }

  @After
  public void tearDown() {
    IncomingCallRingOwner.clearForTests();
  }

  @Test
  public void duplicateSurfaceOwnerClaim_doesNotBlockRingStart() {
    String callId = "dup-surface-ring-1";
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        context, callId, IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY, "first_fcm");
    assertFalse(
        IncomingCallSurfaceOwner.tryClaimIncomingOwner(
            context, callId, IncomingCallSurfaceOwner.SurfaceOwner.WEB_IN_APP, "second_fcm"));

    assertTrue(IncomingCallRingOwner.start(context, callId));
    assertEquals(callId, IncomingCallRingOwner.getActiveCallId());
  }

  @Test
  public void freshCallId_afterConsumedPrevious_stillRings() {
    String callId1 = "consumed-prev-1";
    String callId2 = "fresh-next-2";
    DibayCallConsumedStore.mark(context, callId1, "cancelled");

    assertFalse(IncomingCallRingOwner.start(context, callId1));
    assertEquals("consumed", IncomingCallRingOwner.describeStartBlockReason(context, callId1));

    assertTrue(IncomingCallRingOwner.start(context, callId2));
    assertEquals(callId2, IncomingCallRingOwner.getActiveCallId());
  }

  @Test
  public void sameCallId_ringDedupesWithoutRestart() {
    String callId = "dedupe-ring-1";
    assertTrue(IncomingCallRingOwner.start(context, callId));
    assertFalse(IncomingCallRingOwner.start(context, callId));
    assertEquals("deduped", IncomingCallRingOwner.describeStartBlockReason(context, callId));
  }
}
