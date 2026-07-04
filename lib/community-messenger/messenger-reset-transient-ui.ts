export type MessengerResetTransientUiOptions = {
  /** false 면 overlay generation 미증가 — 탭 전환 애니메이션 중 이중 리렌더 방지 */
  bumpOverlayGeneration?: boolean;
};

export type MessengerResetTransientUiFn = (options?: MessengerResetTransientUiOptions) => void;
