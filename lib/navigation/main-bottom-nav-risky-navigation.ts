/**
 * CONTRACT — 하단 탭 이동 시 **데이터 손실·진행 중 작업** risky 판별.
 * Phase A: write sheet blocking만 probe (실제 Confirm 재활성화는 Phase B).
 * 교육용 cross-domain Confirm 제거 후, domain guard(cart/checkout/upload/chat) 확장 지점.
 */

export type MainBottomNavRiskyNavigationState = {
  /** 거래/필라이프 글쓰기 시트 open + blockingDraft */
  writeSheetBlocking: boolean;
  // Phase B: cartCheckoutActive, uploadInFlight, chatComposeDirty
};

export const MAIN_BOTTOM_NAV_SAFE_RISKY_STATE: MainBottomNavRiskyNavigationState = {
  writeSheetBlocking: false,
};

export function isMainBottomNavRiskyNavigation(state: MainBottomNavRiskyNavigationState): boolean {
  return state.writeSheetBlocking;
}

export function probeMainBottomNavRiskyNavigation(input: {
  tradeWriteOpen?: boolean;
  tradeWriteBlocking?: boolean;
  philifeWriteOpen?: boolean;
  philifeWriteBlocking?: boolean;
}): MainBottomNavRiskyNavigationState {
  const tradeBlocking = Boolean(input.tradeWriteOpen && input.tradeWriteBlocking);
  const philifeBlocking = Boolean(input.philifeWriteOpen && input.philifeWriteBlocking);
  return {
    writeSheetBlocking: tradeBlocking || philifeBlocking,
  };
}
