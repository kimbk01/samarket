/** 매장 오너 스택(허브→하위) 화면 전환 — 드로어·매장 상세와 동일 270ms */
export const OWNER_STACK_PAGE_SLIDE_MS = 270;

export const OWNER_STACK_PAGE_SLIDE_ENTER_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export const OWNER_STACK_ROUTE_ENTER_CLASSES = [
  "owner-stack-route-enter-rtl-forward",
  "owner-stack-route-enter-ltr-back",
  "owner-stack-route-enter-subtle",
] as const;
