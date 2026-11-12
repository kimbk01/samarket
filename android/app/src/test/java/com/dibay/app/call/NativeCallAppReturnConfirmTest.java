package com.dibay.app.call;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** docs/audit/call-back-app-return-bal-design-2026-11-12.md §5 — 메신저 복귀 실제 결과 판정. */
public class NativeCallAppReturnConfirmTest {
  private static final long W = NativeCallAppReturn.CONFIRM_WINDOW_MS;

  @Test
  public void resumedWithinWindowIsConfirmed() {
    assertEquals(NativeCallAppReturn.RESULT_CONFIRMED, NativeCallAppReturn.judge(10_000L, 10_000L, W));
    assertEquals(NativeCallAppReturn.RESULT_CONFIRMED, NativeCallAppReturn.judge(10_000L, 10_000L + W, W));
  }

  @Test
  public void resumedAfterWindowIsLate() {
    assertEquals(NativeCallAppReturn.RESULT_LATE, NativeCallAppReturn.judge(10_000L, 10_001L + W, W));
  }

  @Test
  public void resumedBeforeRequestIsNotCountedAsResult() {
    // 메신저가 원래 바로 뒤에 있어 요청 전에 재개된 경우 — 요청의 결과가 아니다.
    assertEquals(NativeCallAppReturn.RESULT_LATE, NativeCallAppReturn.judge(10_000L, 9_999L, W));
  }

  @Test
  public void noRequestIsNotConfirmed() {
    assertEquals(NativeCallAppReturn.RESULT_LATE, NativeCallAppReturn.judge(0L, 10_000L, W));
  }
}
