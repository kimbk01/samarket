package com.dibay.app.nativecall;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** android-caller-stuck-after-remote-missed-design §14-1 C-M4 — 발신 준비 중 렌더러 종료. */
public class NativeOutgoingPreparingWebGonePolicyTest {
  private static final long PREP_AT = 1_793_540_000_000L;

  @Test
  public void matches_sameRoomMineRinging_afterPreparingStart() {
    assertTrue(
        NativeOutgoingPreparingWebGonePolicy.matches(
            "r1", PREP_AT, "r1", true, "ringing", PREP_AT + 1_500L));
    // 서버 시각을 못 읽으면 방·발신자·상태로 판정
    assertTrue(NativeOutgoingPreparingWebGonePolicy.matches("r1", PREP_AT, "r1", true, "RINGING", -1));
    // 기기 시계가 서버보다 빨라도 허용 범위 안이면 같은 발신
    assertTrue(
        NativeOutgoingPreparingWebGonePolicy.matches(
            "r1", PREP_AT, "r1", true, "ringing", PREP_AT - 10_000L));
  }

  @Test
  public void matches_rejectsOtherRoomPeerInitiatedNonRingingOrStale() {
    assertFalse(NativeOutgoingPreparingWebGonePolicy.matches("r1", PREP_AT, "r2", true, "ringing", PREP_AT));
    assertFalse(NativeOutgoingPreparingWebGonePolicy.matches("r1", PREP_AT, "r1", false, "ringing", PREP_AT));
    assertFalse(NativeOutgoingPreparingWebGonePolicy.matches("r1", PREP_AT, "r1", true, "active", PREP_AT));
    assertFalse(
        NativeOutgoingPreparingWebGonePolicy.matches(
            "r1", PREP_AT, "r1", true, "ringing", PREP_AT - 31_000L));
    assertFalse(NativeOutgoingPreparingWebGonePolicy.matches("", PREP_AT, "", true, "ringing", PREP_AT));
  }

  @Test
  public void decide_userClosedPreparing_stillCancelsOrphan_butNeverTouchesRedial() {
    // 사용자가 준비 화면을 닫음 + 다른 발신 없음 → 남은 서버 통화는 취소
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.Kind.CANCEL_SESSION,
        NativeOutgoingPreparingWebGonePolicy.decide(1_000L, false, false, 200, true).kind);
    // 사용자가 다시 걸었음(다른 발신 존재) → 아무것도 하지 않음
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.Kind.STOP,
        NativeOutgoingPreparingWebGonePolicy.decide(1_000L, false, true, 200, true).kind);
    // 사용자가 닫았고 시간 안에 서버 통화도 없음 → 조용히 종료(닫을 화면 없음)
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.Kind.STOP,
        NativeOutgoingPreparingWebGonePolicy.decide(15_000L, false, false, 200, false).kind);
  }

  @Test
  public void decide_cancelsWhenMatched_closesAfterWindow_retriesOtherwise() {
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.Kind.CANCEL_SESSION,
        NativeOutgoingPreparingWebGonePolicy.decide(2_000L, true, false, 200, true).kind);
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.Kind.CLOSE_ONLY,
        NativeOutgoingPreparingWebGonePolicy.decide(15_000L, true, false, 200, false).kind);
    NativeOutgoingPreparingWebGonePolicy.Decision wait =
        NativeOutgoingPreparingWebGonePolicy.decide(2_000L, true, false, 0, false);
    assertEquals(NativeOutgoingPreparingWebGonePolicy.Kind.CONTINUE, wait.kind);
    assertEquals(NativeOutgoingPreparingWebGonePolicy.INTERVAL_MS, wait.delayMs);
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.RATE_LIMIT_RETRY_MS,
        NativeOutgoingPreparingWebGonePolicy.decide(2_000L, true, false, 429, false).delayMs);
    assertEquals(
        NativeOutgoingPreparingWebGonePolicy.Kind.CLOSE_ONLY,
        NativeOutgoingPreparingWebGonePolicy.decide(2_000L, true, false, 401, false).kind);
  }

  @Test
  public void parseIsoMs_serverFormats() {
    long expected = 1_793_541_407_574L / 1000L * 1000L; // 2026-11-01T13:56:47Z (소수점 이하 버림)
    assertEquals(expected, NativeOutgoingPreparingWebGonePolicy.parseIsoMs("2026-11-01T13:56:47.574+00:00"));
    assertEquals(expected, NativeOutgoingPreparingWebGonePolicy.parseIsoMs("2026-11-01T13:56:47.574Z"));
    assertEquals(expected, NativeOutgoingPreparingWebGonePolicy.parseIsoMs("2026-11-01T13:56:47Z"));
    assertEquals(-1L, NativeOutgoingPreparingWebGonePolicy.parseIsoMs(""));
    assertEquals(-1L, NativeOutgoingPreparingWebGonePolicy.parseIsoMs("not-a-date"));
  }
}
