/**
 * 매장 오너 컴팩트 셸 레이아웃 — Tailwind·JS·CSS 단일 계약.
 * 시각 규칙은 `app/owner-compact-shell.css`, 브레이크 상한은 `owner-compact-shell-viewport.ts`.
 */

export const OWNER_COMPACT_SHELL_BODY_DATA_ATTR = "data-owner-compact-shell";

export const OWNER_COMPACT_SHELL_HEADER_CLASS = "owner-compact-shell__header";
export const OWNER_COMPACT_SHELL_HEADER_INNER_CLASS = "owner-compact-shell__header-inner";
export const OWNER_COMPACT_SHELL_MAIN_CLASS = "owner-compact-shell__main";
export const OWNER_COMPACT_SHELL_COLUMN_CLASS = "owner-compact-shell__column";
export const OWNER_COMPACT_SHELL_SCROLL_CLASS = "owner-compact-shell__scroll";
export const OWNER_COMPACT_SHELL_MAIN_PB_CLASS = "owner-compact-shell__main-pb";
export const OWNER_COMPACT_SHELL_BLEED_X_CLASS = "owner-compact-shell__bleed-x";
export const OWNER_STORE_ADMIN_FOOTER_BAR_CLASS = "owner-store-admin-footer-bar";

/**
 * Owner stack viewport root — height lock in `app/owner-compact-shell.css`.
 * Mount ONCE on the outermost BusinessAdminShell stack node.
 * Never nest another `.owner-stack-shell` / `data-owner-stack-shell` inside.
 */
export const OWNER_STACK_SHELL_ROOT_CLASS = "owner-stack-shell";
export const OWNER_STACK_SHELL_ROOT_ATTR = "data-owner-stack-shell";

let ownerCompactShellBodyEnabled = false;
const ownerCompactShellBodyListeners = new Set<() => void>();

function emitOwnerCompactShellBodyFlag(): void {
  for (const cb of ownerCompactShellBodyListeners) cb();
}

/** `BusinessAdminShell` — compact 일 때 `document.body` 토글 */
export function applyOwnerCompactShellBodyFlag(enabled: boolean): void {
  if (typeof document === "undefined") {
    if (ownerCompactShellBodyEnabled === enabled) return;
    ownerCompactShellBodyEnabled = enabled;
    emitOwnerCompactShellBodyFlag();
    return;
  }
  if (enabled) document.body.setAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR, "");
  else document.body.removeAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR);
  if (ownerCompactShellBodyEnabled === enabled) return;
  ownerCompactShellBodyEnabled = enabled;
  emitOwnerCompactShellBodyFlag();
}

/** Support FAB / overlay — Owner shell active (independent of bottom-nav mount). */
export function getOwnerCompactShellBodyFlag(): boolean {
  if (typeof document !== "undefined") {
    return document.body.hasAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR);
  }
  return ownerCompactShellBodyEnabled;
}

export function subscribeOwnerCompactShellBodyFlagStore(onStore: () => void): () => void {
  ownerCompactShellBodyListeners.add(onStore);
  return () => {
    ownerCompactShellBodyListeners.delete(onStore);
  };
}
