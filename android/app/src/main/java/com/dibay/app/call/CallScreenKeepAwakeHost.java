package com.dibay.app.call;

/**
 * 통화 화면이 자기 창의 화면 유지 규칙을 직접 가진다는 표시.
 *
 * <p>규칙: docs/audit/call-screen-awake-audit-2026-11-16.md §4-1 (Telegram VoIPWindowView 와 같은 창 단위 유지).
 * {@link ScreenAwakeBridge} 가 연결 영상 유지를 다른 화면으로 옮기거나 해제하면서 이 화면의 창 플래그를 지운 뒤에는
 * 이 화면이 자기 규칙으로 다시 계산한다(브리지가 통화 화면 규칙을 덮어쓰지 않게).
 */
public interface CallScreenKeepAwakeHost {
  void reapplyCallScreenKeepAwake(String source);
}
