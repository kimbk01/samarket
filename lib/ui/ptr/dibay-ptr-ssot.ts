/**
 * DIBAY Pull-to-Refresh(PTR) — 물리·타이밍·상태 SSOT.
 *
 * 물리값(임계·상한·감쇠·최소 스핀·접힘)은 기존 `/stores` 홈 PTR 값 그대로 이관 — 변경 시 실측 근거 필요.
 * 결과 표시(SUCCESS/ERROR) 유지 시간·핸들러 상한 타임아웃은 Owner 확정 전 잠정값
 * (`docs/dibay-pull-to-refresh-audit-and-design.md` O14).
 */

/** 손가락 놓음 임계 — `pullPx` 스케일(touch dy×damping) */
export const DIBAY_PTR_THRESHOLD_PX = 58;
/** 슬롯 확장 상한 */
export const DIBAY_PTR_MAX_PX = 106;
/** 새로고침 중 슬롯 유지 하한 */
export const DIBAY_PTR_SLOT_PX = 52;
/** 당김 hint 최소 표시 */
export const DIBAY_PTR_HINT_MIN_PX = 14;
/** 새로고침 스피너 최소 노출(ms) */
export const DIBAY_PTR_MIN_SPIN_MS = 450;
/** 슬롯 height·opacity 복귀 전환(ms) */
export const DIBAY_PTR_COLLAPSE_MS = 320;
/** 당김 인식 시작 거리(px) */
export const DIBAY_PTR_ENGAGE_PX = 10;
/** 세로 판정 — `dy ≥ |dx| × ratio` */
export const DIBAY_PTR_VERTICAL_RATIO = 0.8;
/** 이 비율 이상 당기면 손 뗀 직후 클릭 1회 억제 */
export const DIBAY_PTR_CLICK_SUPPRESS_RATIO = 0.25;
/**
 * 당김 종료 후 이 시간 안의 click 만 억제(당김이 합성한 click).
 * 그 이후·새 터치 시작 시 해제 — 다음 정상 탭을 삼키지 않는다.
 */
export const DIBAY_PTR_CLICK_SUPPRESS_WINDOW_MS = 400;

/** 성공 문구 유지(ms) — 잠정 */
export const DIBAY_PTR_SUCCESS_HOLD_MS = 700;
/** 실패 문구 유지(ms) — 잠정 */
export const DIBAY_PTR_ERROR_HOLD_MS = 2200;
/**
 * 핸들러 상한(ms) — 잠정. 도메인 자체 타임아웃(커뮤니티 28s)보다 짧으면 도메인 결과를 덮으므로 그 이상.
 * 초과 시 UI 는 ERROR 로 종료하되 진행 중 요청을 강제 취소하지 않는다(도메인 가드가 늦은 응답을 판정).
 */
export const DIBAY_PTR_HANDLER_TIMEOUT_MS = 30_000;

export type DibayPtrPhase =
  | "IDLE"
  | "PULLING"
  | "READY"
  | "REFRESHING"
  | "SUCCESS"
  | "ERROR"
  | "CANCELLED";

/** 도메인 핸들러 결과 — 화면에 신규 데이터가 커밋됐을 때만 `success` */
export type DibayPtrOutcome = "success" | "error" | "cancelled";

/**
 * 핸들러 반환 계약.
 * - `void` (레거시): 예외 없이 끝나면 `success` 로 간주
 * - throw / reject: `error`
 */
export type DibayPtrHandlerResult = void | DibayPtrOutcome;
export type DibayPtrHandler = () => DibayPtrHandlerResult | Promise<DibayPtrHandlerResult>;

export type DibayPtrRunOutcome = {
  status: DibayPtrOutcome;
  /** 다중 핸들러 중 일부만 실패 */
  partial: boolean;
  timedOut: boolean;
};

export type DibayPtrRunResult = DibayPtrRunOutcome | "no_handler" | "busy";

/** touch dy → pullPx (러버밴드 — 상한 근처에서 덜 끈김) */
export function computeDibayPtrPullPxFromTouchDy(dy: number): number {
  if (dy <= 0) return 0;
  const linear = dy * 0.48;
  const max = DIBAY_PTR_MAX_PX;
  return Math.min(max, max * (1 - Math.exp(-linear / (max * 0.62))));
}

export function resolveDibayPtrSlotPx(releasePullPx: number): number {
  return Math.min(
    DIBAY_PTR_MAX_PX,
    Math.max(releasePullPx, DIBAY_PTR_THRESHOLD_PX, DIBAY_PTR_SLOT_PX)
  );
}

export function resolveDibayPtrHintHeightPx(snap: { pullPx: number; refreshing: boolean }): number {
  if (snap.refreshing) return snap.pullPx;
  return snap.pullPx > 2 ? snap.pullPx : 0;
}

export function deriveDibayPtrPullPhase(pullPx: number): DibayPtrPhase {
  if (pullPx >= DIBAY_PTR_THRESHOLD_PX) return "READY";
  if (pullPx > 0) return "PULLING";
  return "IDLE";
}

export function isDibayPtrVerticalPullDown(dy: number, dx: number): boolean {
  return dy > DIBAY_PTR_ENGAGE_PX && dy >= Math.abs(dx) * DIBAY_PTR_VERTICAL_RATIO;
}

export function aggregateDibayPtrOutcomes(
  results: ReadonlyArray<{ status: DibayPtrOutcome; timedOut: boolean }>
): DibayPtrRunOutcome {
  const errors = results.filter((r) => r.status === "error").length;
  const successes = results.filter((r) => r.status === "success").length;
  const timedOut = results.some((r) => r.timedOut);
  if (errors > 0) return { status: "error", partial: successes > 0, timedOut };
  if (successes > 0) return { status: "success", partial: false, timedOut };
  return { status: "cancelled", partial: false, timedOut };
}
