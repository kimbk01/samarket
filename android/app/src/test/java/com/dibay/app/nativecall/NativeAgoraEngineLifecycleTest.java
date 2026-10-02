package com.dibay.app.nativecall;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** WP-3 NEW-29 — engine ownership serialization contracts (pure JVM, no Android). */
public class NativeAgoraEngineLifecycleTest {

  @Before
  public void setUp() {
    NativeAgoraEngineLifecycle.logToConsoleForTests = true;
    NativeAgoraEngineLifecycle.resetForTests();
  }

  @After
  public void tearDown() {
    NativeAgoraEngineLifecycle.resetForTests();
  }

  @Test
  public void acquire_whenIdle_takesOwnershipAtCurrentEpoch() throws Exception {
    long epoch = NativeAgoraEngineLifecycle.awaitReleaseAndAcquire("voice", "c1");
    assertEquals(0L, epoch);
    assertEquals(NativeAgoraEngineLifecycle.State.OWNED, NativeAgoraEngineLifecycle.currentState());
    assertEquals("voice:c1", NativeAgoraEngineLifecycle.currentOwner());
  }

  @Test
  public void beginRelease_refusedWhileOwned() throws Exception {
    NativeAgoraEngineLifecycle.awaitReleaseAndAcquire("voice", "c1");
    long token = NativeAgoraEngineLifecycle.beginRelease("video", "transition");
    assertEquals(NativeAgoraEngineLifecycle.RELEASE_REFUSED_OWNED, token);
  }

  @Test
  public void contractA_B_C_D_acquireWaitsForReleaseAndEpochBumps() throws Exception {
    // Previous call owned, then handed ownership back (IDLE) but engine still needs releasing.
    NativeAgoraEngineLifecycle.awaitReleaseAndAcquire("voice", "prev");
    NativeAgoraEngineLifecycle.releaseOwnership("voice", "prev");

    long token = NativeAgoraEngineLifecycle.beginRelease("voice", "zombie");
    assertTrue(token > 0);
    assertEquals(NativeAgoraEngineLifecycle.State.RELEASING, NativeAgoraEngineLifecycle.currentState());
    // Contract D: destroy allowed only for the active token.
    assertTrue(NativeAgoraEngineLifecycle.mayDestroy(token));
    assertFalse(NativeAgoraEngineLifecycle.mayDestroy(token + 99));

    // A new call's acquire must BLOCK until the release completes (Contract A/B).
    final AtomicLong acquiredEpoch = new AtomicLong(-1);
    final CountDownLatch acquireReturned = new CountDownLatch(1);
    final AtomicBoolean acquiredBeforeRelease = new AtomicBoolean(false);
    Thread joiner =
        new Thread(
            () -> {
              try {
                long e = NativeAgoraEngineLifecycle.awaitReleaseAndAcquire("video", "next");
                acquiredEpoch.set(e);
                acquireReturned.countDown();
              } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
              }
            });
    joiner.start();

    // Give the joiner time to reach the wait; it must not have acquired yet.
    Thread.sleep(150);
    if (acquireReturned.getCount() == 0) acquiredBeforeRelease.set(true);
    assertFalse("acquire must wait for release", acquiredBeforeRelease.get());

    // Simulate the destroy thread finishing.
    NativeAgoraEngineLifecycle.completeRelease(token, "voice");

    assertTrue(acquireReturned.await(2, TimeUnit.SECONDS));
    joiner.join(2000);
    // Epoch bumped by the release; the new owner sees epoch 1 (old engine ref from epoch 0 is stale).
    assertEquals(1L, acquiredEpoch.get());
    assertEquals("video:next", NativeAgoraEngineLifecycle.currentOwner());
  }

  @Test
  public void secondBeginRelease_whileReleasing_isCoalesced() throws Exception {
    NativeAgoraEngineLifecycle.awaitReleaseAndAcquire("voice", "prev");
    NativeAgoraEngineLifecycle.releaseOwnership("voice", "prev");
    long token = NativeAgoraEngineLifecycle.beginRelease("voice", "zombie");
    assertTrue(token > 0);
    long second = NativeAgoraEngineLifecycle.beginRelease("video", "zombie");
    assertEquals(NativeAgoraEngineLifecycle.RELEASE_ALREADY_IN_PROGRESS, second);
    NativeAgoraEngineLifecycle.completeRelease(token, "voice");
  }

  @Test
  public void staleCompleteRelease_isIgnored() throws Exception {
    NativeAgoraEngineLifecycle.awaitReleaseAndAcquire("voice", "prev");
    NativeAgoraEngineLifecycle.releaseOwnership("voice", "prev");
    long token = NativeAgoraEngineLifecycle.beginRelease("voice", "zombie");
    NativeAgoraEngineLifecycle.completeRelease(token, "voice");
    long epochAfter = NativeAgoraEngineLifecycle.currentEpoch();
    // A late/duplicate completion with the same (now inactive) token must not bump epoch again.
    NativeAgoraEngineLifecycle.completeRelease(token, "voice");
    assertEquals(epochAfter, NativeAgoraEngineLifecycle.currentEpoch());
    assertNull(NativeAgoraEngineLifecycle.currentOwner());
  }
}
