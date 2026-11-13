package com.dibay.app.nativevideo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Test;

/** 카메라 끄기 설계 §4-1·§4-5 — docs/audit/call-camera-off-plan-2026-11-14.md */
public class NativeVideoMediaStateTest {
  private static final String CALL = "call-camera-test";

  @After
  public void tearDown() {
    NativeVideoMediaState.clear(CALL);
    NativeVideoMediaState.clear("other");
  }

  @Test
  public void newCallStartsWithBothCamerasOn() {
    assertTrue(NativeVideoMediaState.isLocalCameraOn(CALL));
    assertTrue(NativeVideoMediaState.isRemoteCameraOn(CALL));
  }

  @Test
  public void localStateSurvivesUntilCleared() {
    NativeVideoMediaState.setLocalCameraOn(CALL, false);
    assertFalse(NativeVideoMediaState.isLocalCameraOn(CALL));
    assertTrue("다른 통화는 영향 없음", NativeVideoMediaState.isLocalCameraOn("other"));
    NativeVideoMediaState.clear(CALL);
    assertTrue("통화 끝 → 다음 통화는 켜짐", NativeVideoMediaState.isLocalCameraOn(CALL));
  }

  @Test
  public void micStartsUnmutedAndClearsWithCall() {
    assertFalse(NativeVideoMediaState.isMicMuted(CALL));
    NativeVideoMediaState.setMicMuted(CALL, true);
    assertTrue(NativeVideoMediaState.isMicMuted(CALL));
    assertFalse("다른 통화는 영향 없음", NativeVideoMediaState.isMicMuted("other"));
    NativeVideoMediaState.clear(CALL);
    assertFalse("통화 끝 → 다음 통화는 음소거 아님", NativeVideoMediaState.isMicMuted(CALL));
  }

  @Test
  public void remoteChangeReportsOnlyRealChanges() {
    assertFalse("이미 켜짐", NativeVideoMediaState.setRemoteCameraOn(CALL, true));
    assertTrue(NativeVideoMediaState.setRemoteCameraOn(CALL, false));
    assertFalse("같은 값 반복", NativeVideoMediaState.setRemoteCameraOn(CALL, false));
    assertTrue(NativeVideoMediaState.setRemoteCameraOn(CALL, true));
  }

  @Test
  public void remoteMutedStoppedMeansCameraOff() {
    assertEquals(Boolean.FALSE, NativeVideoMediaState.remoteCameraOnFromVideoState(0, 5));
  }

  @Test
  public void remoteUnmutedOrDecodingMeansCameraOn() {
    assertEquals(Boolean.TRUE, NativeVideoMediaState.remoteCameraOnFromVideoState(2, 6));
    assertEquals(Boolean.TRUE, NativeVideoMediaState.remoteCameraOnFromVideoState(1, 6));
    assertEquals(Boolean.TRUE, NativeVideoMediaState.remoteCameraOnFromVideoState(2, 2));
    assertEquals(Boolean.TRUE, NativeVideoMediaState.remoteCameraOnFromVideoState(1, 0));
  }

  @Test
  public void networkFreezeIsNotCameraOff() {
    assertNull("혼잡 멈춤", NativeVideoMediaState.remoteCameraOnFromVideoState(3, 1));
    assertNull("음성만으로 낮춤", NativeVideoMediaState.remoteCameraOnFromVideoState(3, 8));
    assertNull("퇴장", NativeVideoMediaState.remoteCameraOnFromVideoState(0, 7));
    assertNull("초기 상태", NativeVideoMediaState.remoteCameraOnFromVideoState(0, 0));
    assertNull("내가 수신 멈춤", NativeVideoMediaState.remoteCameraOnFromVideoState(0, 3));
    assertNull("시작 실패", NativeVideoMediaState.remoteCameraOnFromVideoState(4, 0));
  }
}
