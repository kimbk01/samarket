/**
 * Shared DOM writers for iOS form/app-shell keyboard visible band.
 * Used by useIosFormKeyboardVisibleBand + AppKeyboardResizeBootstrap (single store).
 */

import {
  shouldApplyIosFormLayoutWriter,
  type IosFormVisibleBandPx,
} from "@/lib/ui/ios-form-keyboard-viewport-contract";

export const DIBAY_KB_OWNER_ATTR = "data-dibay-kb-owner";
export const DIBAY_KB_OPEN_ATTR = "data-dibay-ios-form-kb";
export const DIBAY_VV_TOP_VAR = "--dibay-vv-top";
export const DIBAY_VV_HEIGHT_VAR = "--dibay-vv-height";
export const DIBAY_KB_INSET_VAR = "--dibay-keyboard-inset";
/** Alias for app-shell CSS (same value as --dibay-vv-height while kb open). */
export const DIBAY_APP_VISIBLE_HEIGHT_VAR = "--app-visible-height";

export function clearDibayIosFormKeyboardRootVars(root: HTMLElement): void {
  root.style.removeProperty(DIBAY_VV_TOP_VAR);
  root.style.removeProperty(DIBAY_VV_HEIGHT_VAR);
  root.style.removeProperty(DIBAY_KB_INSET_VAR);
  root.style.removeProperty(DIBAY_APP_VISIBLE_HEIGHT_VAR);
  root.removeAttribute(DIBAY_KB_OPEN_ATTR);
  if (root.getAttribute(DIBAY_KB_OWNER_ATTR) === "ios_form_visible_band") {
    root.removeAttribute(DIBAY_KB_OWNER_ATTR);
  }
}

export function applyDibayIosFormKeyboardRootVars(
  root: HTMLElement,
  band: IosFormVisibleBandPx
): void {
  if (!shouldApplyIosFormLayoutWriter(band) || !band.keyboardOpen) {
    clearDibayIosFormKeyboardRootVars(root);
    if (band.owner === "ios_form_visible_band") {
      root.setAttribute(DIBAY_KB_OWNER_ATTR, "ios_form_visible_band");
    }
    return;
  }
  root.setAttribute(DIBAY_KB_OWNER_ATTR, "ios_form_visible_band");
  root.setAttribute(DIBAY_KB_OPEN_ATTR, "1");
  root.style.setProperty(DIBAY_VV_TOP_VAR, `${band.topPx}px`);
  root.style.setProperty(DIBAY_VV_HEIGHT_VAR, `${band.heightPx}px`);
  root.style.setProperty(DIBAY_KB_INSET_VAR, `${band.insetCssPx}px`);
  root.style.setProperty(DIBAY_APP_VISIBLE_HEIGHT_VAR, `${band.heightPx}px`);
}

export function applyDibayIosFormShellBand(
  shell: HTMLElement | null,
  band: IosFormVisibleBandPx
): void {
  if (!shell) return;
  if (!shouldApplyIosFormLayoutWriter(band) || !band.keyboardOpen) {
    shell.style.removeProperty("height");
    shell.style.removeProperty("max-height");
    shell.style.removeProperty("min-height");
    shell.style.removeProperty("top");
    shell.dataset.dibayIosFormKb = "0";
    return;
  }
  shell.dataset.dibayIosFormKb = "1";
  shell.style.height = `${band.heightPx}px`;
  shell.style.maxHeight = `${band.heightPx}px`;
  shell.style.minHeight = `${band.heightPx}px`;
  if (band.topPx > 0) {
    shell.style.top = `${band.topPx}px`;
  } else {
    shell.style.removeProperty("top");
  }
}

/** True when html already has form/app shell band applied (layout accounts for keyboard). */
export function isDibayIosFormKeyboardBandActive(doc: Document | null | undefined): boolean {
  if (!doc?.documentElement) return false;
  return doc.documentElement.getAttribute(DIBAY_KB_OPEN_ATTR) === "1";
}

const FOCUSABLE_FIELD_SELECTOR =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="image"]), textarea, select, [contenteditable="true"]';

export function isDibayKeyboardResizeFocusTarget(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.matches(FOCUSABLE_FIELD_SELECTOR)) return false;
  if (el.closest("[data-cm-room].cm-room-shell")) return false;
  return true;
}
