package com.dibay.app.nativevideo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** 신호 3단계 — docs/audit/call-video-chrome-signal-border-design-2026-11-12.md D3. */
public class NativeVideoNetworkTierTest {
  @Test
  public void agoraValuesMapToThreeTiers() {
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, NativeVideoNetworkTier.fromAgora(1));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, NativeVideoNetworkTier.fromAgora(2));
    assertEquals(NativeVideoNetworkTier.Tier.POOR, NativeVideoNetworkTier.fromAgora(3));
    assertEquals(NativeVideoNetworkTier.Tier.POOR, NativeVideoNetworkTier.fromAgora(4));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, NativeVideoNetworkTier.fromAgora(5));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, NativeVideoNetworkTier.fromAgora(6));
  }

  @Test
  public void unknownUnsupportedAndDetectingAreNotJudged() {
    assertNull(NativeVideoNetworkTier.fromAgora(0));
    assertNull(NativeVideoNetworkTier.fromAgora(7));
    assertNull(NativeVideoNetworkTier.fromAgora(8));
    assertNull(NativeVideoNetworkTier.fromAgora(-1));
  }

  @Test
  public void detectingNoLongerShowsVeryPoor() {
    NativeVideoNetworkTier t = new NativeVideoNetworkTier();
    // 예전: max(1, 8) = 8 → 「매우 나쁨」. 지금: 8 은 무시, 1 로 판정 → 좋음 유지.
    assertFalse(t.onSample(1, 8));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
    assertFalse(t.onSample(8, 8));
    assertFalse(t.onSample(0, 0));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
  }

  @Test
  public void worstOfTxRxIsUsed() {
    assertEquals(NativeVideoNetworkTier.Tier.POOR, NativeVideoNetworkTier.worstOf(1, 4));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, NativeVideoNetworkTier.worstOf(6, 2));
    assertEquals(NativeVideoNetworkTier.Tier.POOR, NativeVideoNetworkTier.worstOf(0, 3));
    assertNull(NativeVideoNetworkTier.worstOf(0, 8));
  }

  @Test
  public void worsensImmediatelyRecoversAfterTwoSamples() {
    NativeVideoNetworkTier t = new NativeVideoNetworkTier();
    assertTrue(t.onSample(5, 5));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, t.displayed());
    assertFalse(t.onSample(1, 1));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, t.displayed());
    assertTrue(t.onSample(1, 1));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
  }

  @Test
  public void detectingDuringRecoveryDoesNotResetOrCount() {
    NativeVideoNetworkTier t = new NativeVideoNetworkTier();
    t.onSample(3, 3);
    assertEquals(NativeVideoNetworkTier.Tier.POOR, t.displayed());
    assertFalse(t.onSample(1, 1));
    assertFalse(t.onSample(8, 8));
    assertTrue(t.onSample(2, 2));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
  }

  @Test
  public void resetReturnsToGood() {
    NativeVideoNetworkTier t = new NativeVideoNetworkTier();
    t.onSample(6, 6);
    t.reset();
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
  }

  @Test
  public void reconnectingShowsVeryPoorRegardlessOfSamples() {
    NativeVideoNetworkTier t = new NativeVideoNetworkTier();
    assertTrue(t.onConnectionState(NativeVideoNetworkTier.AGORA_STATE_RECONNECTING));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, t.displayed());
    // 재연결 중 들어오는 좋은 값으로는 회복하지 않는다
    assertFalse(t.onSample(1, 1));
    assertFalse(t.onSample(1, 1));
    assertEquals(NativeVideoNetworkTier.Tier.VERY_POOR, t.displayed());
    // 다시 연결된 뒤 좋은 값 2번 → 좋음
    assertFalse(t.onConnectionState(NativeVideoNetworkTier.AGORA_STATE_CONNECTED));
    assertFalse(t.onSample(1, 1));
    assertTrue(t.onSample(2, 1));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
  }

  @Test
  public void otherConnectionStatesDoNotChangeTier() {
    NativeVideoNetworkTier t = new NativeVideoNetworkTier();
    assertFalse(t.onConnectionState(1));
    assertFalse(t.onConnectionState(2));
    assertFalse(t.onConnectionState(3));
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
    t.onConnectionState(NativeVideoNetworkTier.AGORA_STATE_RECONNECTING);
    t.reset();
    assertFalse(t.reconnecting());
    assertEquals(NativeVideoNetworkTier.Tier.GOOD, t.displayed());
  }
}
