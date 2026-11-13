package com.dibay.app.nativevideo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Test;

/** 카메라 끄기 설계 §4-1·§4-5 — docs/audit/call-camera-off-plan-2026-11-14.md */
public class NativeVideoCameraStateTest {
  private static final String CALL = "call-camera-test";

  @After
  public void tearDown() {
    NativeVideoCameraState.clear(CALL);
    NativeVideoCameraState.clear("other");
  }

  @Test
  public void newCallStartsWithBothCamerasOn() {
    assertTrue(NativeVideoCameraState.isLocalCameraOn(CALL));
    assertTrue(NativeVideoCameraState.isRemoteCameraOn(CALL));
  }

  @Test
  public void localStateSurvivesUntilCleared() {
    NativeVideoCameraState.setLocalCameraOn(CALL, false);
    assertFalse(NativeVideoCameraState.isLocalCameraOn(CALL));
    assertTrue("다른 통화는 영향 없음", NativeVideoCameraState.isLocalCameraOn("other"));
    NativeVideoCameraState.clear(CALL);
    assertTrue("통화 끝 → 다음 통화는 켜짐", NativeVideoCameraState.isLocalCameraOn(CALL));
  }

  @Test
  public void remoteChangeReportsOnlyRealChanges() {
    assertFalse("이미 켜짐", NativeVideoCameraState.setRemoteCameraOn(CALL, true));
    assertTrue(NativeVideoCameraState.setRemoteCameraOn(CALL, false));
    assertFalse("같은 값 반복", NativeVideoCameraState.setRemoteCameraOn(CALL, false));
    assertTrue(NativeVideoCameraState.setRemoteCameraOn(CALL, true));
  }

  @Test
  public void remoteMutedStoppedMeansCameraOff() {
    assertEquals(Boolean.FALSE, NativeVideoCameraState.remoteCameraOnFromVideoState(0, 5));
  }

  @Test
  public void remoteUnmutedOrDecodingMeansCameraOn() {
    assertEquals(Boolean.TRUE, NativeVideoCameraState.remoteCameraOnFromVideoState(2, 6));
    assertEquals(Boolean.TRUE, NativeVideoCameraState.remoteCameraOnFromVideoState(1, 6));
    assertEquals(Boolean.TRUE, NativeVideoCameraState.remoteCameraOnFromVideoState(2, 2));
    assertEquals(Boolean.TRUE, NativeVideoCameraState.remoteCameraOnFromVideoState(1, 0));
  }

  @Test
  public void networkFreezeIsNotCameraOff() {
    assertNull("혼잡 멈춤", NativeVideoCameraState.remoteCameraOnFromVideoState(3, 1));
    assertNull("음성만으로 낮춤", NativeVideoCameraState.remoteCameraOnFromVideoState(3, 8));
    assertNull("퇴장", NativeVideoCameraState.remoteCameraOnFromVideoState(0, 7));
    assertNull("초기 상태", NativeVideoCameraState.remoteCameraOnFromVideoState(0, 0));
    assertNull("내가 수신 멈춤", NativeVideoCameraState.remoteCameraOnFromVideoState(0, 3));
    assertNull("시작 실패", NativeVideoCameraState.remoteCameraOnFromVideoState(4, 0));
  }
}
