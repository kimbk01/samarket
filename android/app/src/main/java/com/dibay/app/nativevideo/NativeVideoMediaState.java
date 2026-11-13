package com.dibay.app.nativevideo;

import java.util.concurrent.ConcurrentHashMap;

/**
 * 영상 통화 카메라·마이크 상태 단일 보관소 (통화 id 단위). 화면(Activity)은 다시 만들어져도 여기 값을 읽는다.
 *
 * <p>설계: docs/audit/call-camera-off-plan-2026-11-14.md §4-1·§4-5·§12(마이크). 상대 카메라 판정은 Agora 공식 문서
 * (onRemoteVideoStateChanged state·reason) 기준 — 네트워크 멈춤(FROZEN)은 카메라 꺼짐이 아니다.
 */
final class NativeVideoMediaState {
  /** Agora REMOTE_VIDEO_STATE_* (4.x 공식 값). */
  static final int REMOTE_VIDEO_STATE_STOPPED = 0;

  static final int REMOTE_VIDEO_STATE_STARTING = 1;
  static final int REMOTE_VIDEO_STATE_DECODING = 2;

  /** Agora REMOTE_VIDEO_STATE_REASON_* (4.x 공식 값). */
  static final int REASON_REMOTE_MUTED = 5;

  static final int REASON_REMOTE_UNMUTED = 6;

  private static final ConcurrentHashMap<String, Boolean> LOCAL_CAMERA_ON = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> REMOTE_CAMERA_ON = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> MIC_MUTED = new ConcurrentHashMap<>();

  private NativeVideoMediaState() {}

  private static String key(String callId) {
    return callId != null ? callId.trim() : "";
  }

  /** 새 통화는 항상 켜짐. */
  static boolean isLocalCameraOn(String callId) {
    String k = key(callId);
    if (k.isEmpty()) return true;
    Boolean on = LOCAL_CAMERA_ON.get(k);
    return on == null || on;
  }

  static void setLocalCameraOn(String callId, boolean on) {
    String k = key(callId);
    if (k.isEmpty()) return;
    LOCAL_CAMERA_ON.put(k, on);
  }

  static boolean isRemoteCameraOn(String callId) {
    String k = key(callId);
    if (k.isEmpty()) return true;
    Boolean on = REMOTE_CAMERA_ON.get(k);
    return on == null || on;
  }

  /** @return 값이 바뀌었으면 true */
  static boolean setRemoteCameraOn(String callId, boolean on) {
    String k = key(callId);
    if (k.isEmpty()) return false;
    Boolean previous = REMOTE_CAMERA_ON.put(k, on);
    boolean previousOn = previous == null || previous;
    return previousOn != on;
  }

  /** 새 통화는 항상 음소거 아님. */
  static boolean isMicMuted(String callId) {
    String k = key(callId);
    if (k.isEmpty()) return false;
    Boolean muted = MIC_MUTED.get(k);
    return muted != null && muted;
  }

  static void setMicMuted(String callId, boolean muted) {
    String k = key(callId);
    if (k.isEmpty()) return;
    MIC_MUTED.put(k, muted);
  }

  static void clear(String callId) {
    String k = key(callId);
    if (k.isEmpty()) return;
    LOCAL_CAMERA_ON.remove(k);
    REMOTE_CAMERA_ON.remove(k);
    MIC_MUTED.remove(k);
  }

  /**
   * Agora onRemoteVideoStateChanged → 상대 카메라 상태.
   *
   * @return TRUE 켜짐 · FALSE 꺼짐 · null 바꾸지 않음 (FROZEN·FAILED·퇴장·초기 STOPPED 등)
   */
  static Boolean remoteCameraOnFromVideoState(int state, int reason) {
    if (state == REMOTE_VIDEO_STATE_STOPPED && reason == REASON_REMOTE_MUTED) return Boolean.FALSE;
    if (reason == REASON_REMOTE_UNMUTED) return Boolean.TRUE;
    if (state == REMOTE_VIDEO_STATE_STARTING || state == REMOTE_VIDEO_STATE_DECODING) return Boolean.TRUE;
    return null;
  }
}
