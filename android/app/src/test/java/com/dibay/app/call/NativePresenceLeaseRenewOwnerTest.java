package com.dibay.app.call;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

/**
 * A1–A10 Native presence lease renew owner (session-bound, WebView-independent).
 * Does not claim Production lease cutover.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativePresenceLeaseRenewOwnerTest {
  private Context context;
  private final List<String> renewCalls = new ArrayList<>();
  private final AtomicInteger transportCalls = new AtomicInteger();
  private final AtomicBoolean live = new AtomicBoolean(true);
  private final AtomicReference<NativePresenceLeaseRenewOwner.RenewCallback> lastCb =
      new AtomicReference<>();
  private final AtomicReference<String> failWith = new AtomicReference<>(null);

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativePresenceLeaseRenewOwner.resetForTests();
    renewCalls.clear();
    transportCalls.set(0);
    live.set(true);
    lastCb.set(null);
    failWith.set(null);
  }

  @After
  public void tearDown() {
    NativePresenceLeaseRenewOwner.resetForTests();
  }

  private NativePresenceLeaseRenewOwner.RenewTransport transport() {
    return (app, callId, cb) -> {
      transportCalls.incrementAndGet();
      renewCalls.add(callId);
      lastCb.set(cb);
      String fail = failWith.get();
      if (fail != null) {
        cb.onDone(false, 400, fail);
      } else {
        cb.onDone(true, 200, null);
      }
    };
  }

  private NativePresenceLeaseRenewOwner.LiveGate gate() {
    return callId -> live.get();
  }

  @Test
  public void A1_connected_immediateRenew() {
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertEquals(1, transportCalls.get());
    assertEquals("voice-a", renewCalls.get(0));
    assertTrue(NativePresenceLeaseRenewOwner.isActiveForTests("voice-a"));
  }

  @Test
  public void A2_sparseRenewWhileConnected() {
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertEquals(1, transportCalls.get());
    NativePresenceLeaseRenewOwner.flushSparseForTests();
    ShadowLooper.idleMainLooper();
    assertTrue(transportCalls.get() >= 2);
  }

  @Test
  public void A3_webviewAbsentDoesNotOwnRenew_nativeOwnerIndependent() {
    // Owner has no WebView dependency — start works with Context only.
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertEquals(1, transportCalls.get());
  }

  @Test
  public void A4_terminalStopsRenew() {
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    NativePresenceLeaseRenewOwner.stop("voice-a", "end");
    int before = transportCalls.get();
    NativePresenceLeaseRenewOwner.flushSparseForTests();
    ShadowLooper.idleMainLooper();
    assertEquals(before, transportCalls.get());
    assertFalse(NativePresenceLeaseRenewOwner.isActiveForTests("voice-a"));
  }

  @Test
  public void A5_destroyStopsRenew() {
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    NativePresenceLeaseRenewOwner.resetForTests();
    assertFalse(NativePresenceLeaseRenewOwner.isActiveForTests("voice-a"));
  }

  @Test
  public void A6_sessionReplacement_oldRenewImpossible() {
    NativePresenceLeaseRenewOwner.start(context, "session-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    NativePresenceLeaseRenewOwner.start(context, "session-b", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertTrue(NativePresenceLeaseRenewOwner.isActiveForTests("session-b"));
    assertFalse(NativePresenceLeaseRenewOwner.isActiveForTests("session-a"));
    assertTrue(renewCalls.contains("session-b"));
  }

  @Test
  public void A7_duplicateRenewHarmless() {
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertTrue(NativePresenceLeaseRenewOwner.isActiveForTests("voice-a"));
  }

  @Test
  public void A8_serverNotLive_stopsNoRevive() {
    failWith.set("not_live");
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertFalse(NativePresenceLeaseRenewOwner.isActiveForTests("voice-a"));
    int before = transportCalls.get();
    NativePresenceLeaseRenewOwner.flushSparseForTests();
    assertEquals(before, transportCalls.get());
  }

  @Test
  public void A9_voicePath_intervalMatchesContract() {
    assertEquals(300_000L, NativePresenceLeaseRenewOwner.SHADOW_LEASE_TTL_MS);
    assertEquals(150_000L, NativePresenceLeaseRenewOwner.RENEW_INTERVAL_MS);
    assertEquals(
        NativePresenceLeaseRenewOwner.SHADOW_LEASE_TTL_MS / 2,
        NativePresenceLeaseRenewOwner.RENEW_INTERVAL_MS);
  }

  @Test
  public void A10_videoPath_sameOwnerContract() {
    // Voice/Video share NativePresenceLeaseRenewOwner — same cadence + isolation.
    NativePresenceLeaseRenewOwner.start(context, "video-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertTrue(NativePresenceLeaseRenewOwner.isActiveForTests("video-a"));
    NativePresenceLeaseRenewOwner.stop("video-a", "end");
    assertFalse(NativePresenceLeaseRenewOwner.isActiveForTests("video-a"));
  }

  @Test
  public void liveGateFalse_stops() {
    live.set(false);
    NativePresenceLeaseRenewOwner.start(context, "voice-a", transport(), gate());
    ShadowLooper.idleMainLooper();
    assertEquals(0, transportCalls.get());
    assertFalse(NativePresenceLeaseRenewOwner.isActiveForTests("voice-a"));
  }
}
