/**
 * Delivery locked / local-chrome subpages — viewport safe-area + width SSOT.
 *
 * When `AppStickyHeader` is absent (`isMainColumnViewportLocked` or store subpath
 * `suppressMainTier1`), the **local header** owns `--safe-top`.
 *
 * DO NOT: add `pt-[var(--safe-top)]` on page roots that already mount these headers.
 * DO NOT: `100vw` / `100dvw` / `APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS` on these shells.
 */

/**
 * Local top chrome outer shell — paints into notch/status bar; content row sits below safe-top.
 * Mount `sector-header-shell` / `APP_TIER1_HEADER_BAR_CLASS` on an **inner** child only
 * (shell CSS resets padding and would cancel safe-top).
 */
export const DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS = [
  "z-30 w-full min-w-0 max-w-full shrink-0 box-border",
  "bg-[color:var(--sector-header-bg,var(--sam-surface,#fff))]",
  "pt-[var(--safe-top)]",
].join(" ");

/** Width authority for locked page roots (cart, checkout, addresses, review). */
export const DELIVERY_LOCKED_SUBPAGE_ROOT_CLASS =
  "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden";
