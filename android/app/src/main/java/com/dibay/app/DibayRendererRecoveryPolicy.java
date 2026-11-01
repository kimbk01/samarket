package com.dibay.app;

/**
 * WebView 렌더러 종료(onRenderProcessGone) 복구 판정 — 순수 함수 (android-webview-renderer-gone-design §4 C).
 *
 * <p>1번째 종료 = 화면을 다시 만든다(앞이면 즉시, 뒤면 다음 복귀 때 1번). 이전 종료 후 60초 안의 종료 = 자동 재시작하지
 * 않고 로드 오류 화면(「다시 시도」)을 보여 준다 — 무한 재시작 방지.
 */
public final class DibayRendererRecoveryPolicy {
  public static final long REPEAT_WINDOW_MS = 60_000L;

  public enum Action {
    RECREATE_NOW,
    RECREATE_ON_RETURN,
    SHOW_ERROR
  }

  private DibayRendererRecoveryPolicy() {}

  /**
   * @param nowMs 이번 종료 시각
   * @param previousGoneAtMs 이전 종료 시각 (없으면 0 이하)
   * @param foreground 화면이 앞에 있는지
   */
  public static Action decide(long nowMs, long previousGoneAtMs, boolean foreground) {
    if (previousGoneAtMs > 0L && nowMs - previousGoneAtMs >= 0L && nowMs - previousGoneAtMs < REPEAT_WINDOW_MS) {
      return Action.SHOW_ERROR;
    }
    return foreground ? Action.RECREATE_NOW : Action.RECREATE_ON_RETURN;
  }
}
