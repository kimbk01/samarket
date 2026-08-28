/** Admin gift ops primary CTA — explicit fill so contrast does not depend on `sam-btn-primary` @apply chain. */
export const ADMIN_GIFT_PRIMARY_BTN_STYLE = {
  backgroundColor: "var(--admin-console-accent, #1d4ed8)",
  color: "#ffffff",
} as const;

export const ADMIN_GIFT_PRIMARY_BTN_CLASS =
  "inline-flex min-w-0 touch-manipulation select-none items-center justify-center gap-2 rounded-ui-rect border-0 px-4 font-semibold transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-45";

export function adminGiftPrimaryBtnClass(extra?: string): string {
  return extra ? `${ADMIN_GIFT_PRIMARY_BTN_CLASS} ${extra}` : ADMIN_GIFT_PRIMARY_BTN_CLASS;
}
