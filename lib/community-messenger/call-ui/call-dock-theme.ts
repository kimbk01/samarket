/** DIBAY Call Dock — viewport-fixed global layer (scroll·keyboard·bottom nav 독립) */

/** z-index: modal(1310+) 아래 · bottom nav(1200) 위 */
export const CALL_DOCK_LAYER_Z_INDEX = 1270;

export const CALL_DOCK_DOUBLE_TAP_MS = 300;

export const CALL_DOCK_TRANSITION_MS = 180;

export const CALL_DOCK_TRANSITION_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Tailwind z class — CALL_DOCK_LAYER token */
export const CALL_DOCK_LAYER_CLASS = "z-[1270]";

/** safe-top + 12px — orientation 변경 외 재계산 금지 */
export const CALL_DOCK_TOP_CSS = "calc(env(safe-area-inset-top, 0px) + 12px)";

export const CALL_DOCK_MAX_WIDTH_PX = 420;

export const CALL_DOCK_HORIZONTAL_INSET_PX = 12;

/** GPU compositing — transform·opacity 만 */
export const CALL_DOCK_LAYER_STYLE: Readonly<Record<string, string | number>> = {
  position: "fixed",
  top: CALL_DOCK_TOP_CSS,
  left: CALL_DOCK_HORIZONTAL_INSET_PX,
  right: CALL_DOCK_HORIZONTAL_INSET_PX,
  maxWidth: CALL_DOCK_MAX_WIDTH_PX,
  marginLeft: "auto",
  marginRight: "auto",
  zIndex: CALL_DOCK_LAYER_Z_INDEX,
  pointerEvents: "none",
  willChange: "transform, opacity",
  transform: "translateZ(0)",
};

export function callDockLayerTransitionStyle(visible: boolean): Record<string, string | number> {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "scale(1) translateZ(0)" : "scale(0.97) translateZ(0)",
    transition: `transform ${CALL_DOCK_TRANSITION_MS}ms ${CALL_DOCK_TRANSITION_EASING}, opacity ${CALL_DOCK_TRANSITION_MS}ms ${CALL_DOCK_TRANSITION_EASING}`,
  };
}
