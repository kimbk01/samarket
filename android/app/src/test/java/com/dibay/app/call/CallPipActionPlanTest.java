package com.dibay.app.call;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.dibay.app.call.CallPipActionPlan.Action;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** SSOT docs/dibay-call-minimized-surface-cta-ssot.md §3 · §9 — PiP 버튼 순서·개수 잠금. */
public class CallPipActionPlanTest {
  @Test
  public void videoShowsMicCameraEndInOrder() {
    assertEquals(
        Arrays.asList(Action.MIC, Action.CAMERA, Action.END), CallPipActionPlan.plan(true, true, 3));
    assertEquals(
        Arrays.asList(Action.MIC, Action.CAMERA, Action.END), CallPipActionPlan.plan(true, false, 5));
  }

  @Test
  public void voiceShowsMicEndOnly() {
    assertEquals(Arrays.asList(Action.MIC, Action.END), CallPipActionPlan.plan(false, true, 3));
    assertEquals(Arrays.asList(Action.MIC, Action.END), CallPipActionPlan.plan(false, false, 2));
  }

  @Test
  public void endIsAlwaysPresentWhenAtLeastTwoSlots() {
    // 카메라가 꺼져 있으면 「카메라 켜기」가 가장 낮은 우선순위 → 2칸이면 마이크·종료.
    assertEquals(Arrays.asList(Action.MIC, Action.END), CallPipActionPlan.plan(true, false, 2));
    // 카메라가 켜져 있으면 「카메라 끄기」가 종료보다 우선(Telegram CallPipActions) → 2칸이면 마이크·카메라.
    assertEquals(Arrays.asList(Action.MIC, Action.CAMERA), CallPipActionPlan.plan(true, true, 2));
  }

  @Test
  public void noSlotsMeansNoActions() {
    assertTrue(CallPipActionPlan.plan(true, true, 0).isEmpty());
    assertTrue(CallPipActionPlan.plan(false, true, -1).isEmpty());
  }

  @Test
  public void displayOrderIsMicCameraEnd() {
    assertEquals(Arrays.asList(Action.MIC, Action.CAMERA, Action.END), CallPipActionPlan.DISPLAY_ORDER);
  }

  @Test
  public void stateKeyChangesOnlyWhenButtonStateChanges() {
    List<Action> actions = CallPipActionPlan.plan(true, true, 3);
    String a = CallPipActionPlan.stateKey(actions, false, true, true);
    assertEquals(a, CallPipActionPlan.stateKey(actions, false, true, true));
    assertNotEquals(a, CallPipActionPlan.stateKey(actions, true, true, true));
    assertNotEquals(a, CallPipActionPlan.stateKey(actions, false, false, true));
    assertNotEquals(a, CallPipActionPlan.stateKey(actions, false, true, false));
  }
}
