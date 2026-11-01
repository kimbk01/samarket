package com.dibay.app;

import static org.junit.Assert.assertEquals;

import com.dibay.app.DibayRendererRecoveryPolicy.Action;
import org.junit.Test;

public class DibayRendererRecoveryPolicyTest {

  @Test
  public void firstGoneRecreatesNowInForeground() {
    assertEquals(Action.RECREATE_NOW, DibayRendererRecoveryPolicy.decide(1_000_000L, 0L, true));
  }

  @Test
  public void firstGoneInBackgroundRecreatesOnReturn() {
    assertEquals(Action.RECREATE_ON_RETURN, DibayRendererRecoveryPolicy.decide(1_000_000L, 0L, false));
  }

  @Test
  public void secondGoneWithin60sShowsError() {
    long first = 1_000_000L;
    assertEquals(Action.SHOW_ERROR, DibayRendererRecoveryPolicy.decide(first + 59_999L, first, true));
    assertEquals(Action.SHOW_ERROR, DibayRendererRecoveryPolicy.decide(first + 1L, first, false));
  }

  @Test
  public void goneAfter60sRecreatesAgain() {
    long first = 1_000_000L;
    assertEquals(Action.RECREATE_NOW, DibayRendererRecoveryPolicy.decide(first + 60_000L, first, true));
    assertEquals(Action.RECREATE_ON_RETURN, DibayRendererRecoveryPolicy.decide(first + 120_000L, first, false));
  }

  @Test
  public void clockGoingBackwardsIsNotTreatedAsRepeat() {
    assertEquals(Action.RECREATE_NOW, DibayRendererRecoveryPolicy.decide(1_000L, 5_000L, true));
  }
}
