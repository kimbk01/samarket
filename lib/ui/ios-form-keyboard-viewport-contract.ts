/**
 * iOS form / sheet keyboard visible-band contract (NOT CM room Telegram parity).
 *
 * Authority:
 * - Native (`window.samarketShell.keyboardBottomInsetCssPx`) + visualViewport compete;
 *   never sum both into layout height.
 * - Prefer visualViewport band when overlay gap is meaningful; else native inset fallback.
 * - CM room shell owns layout when mounted — form writers must no-op.
 *
 * @see lib/platform/samarket-shell-keyboard.ts
 * @see useCmRoomVisibleViewportShell (isolated)
 */

import { CM_ROOM_KB_OFFSET_MIN_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

export const DIBAY_IOS_FORM_KB_MIN_OPEN_PX = CM_ROOM_KB_OFFSET_MIN_PX;
export const DIBAY_IOS_FORM_VV_MIN_HEIGHT_PX = 200;
export const DIBAY_IOS_FORM_SAFE_GAP_PX = 12;

export type DibayKeyboardLayoutOwner =
  | "cm_room_vv_band"
  | "ios_form_visible_band"
  | "android_adjust_resize"
  | "none";

export type IosFormVisibleBandPx = {
  keyboardOpen: boolean;
  topPx: number;
  heightPx: number;
  /** Reported inset for probes — single authority value, not a second layout subtractor */
  insetCssPx: number;
  bandAuthority: "visualViewport" | "nativeInset" | "layout";
  owner: DibayKeyboardLayoutOwner;
};

export type IosFormViewportInputs = {
  isIosWebKit: boolean;
  cmRoomShellPresent: boolean;
  layoutHeightPx: number;
  visualViewport: { height: number; offsetTop: number } | null;
  nativeInsetCssPx: number | null;
  minOpenPx?: number;
  minHeightPx?: number;
};

/** True when a CM room shell is in the DOM (room authority wins). */
export function isCmRoomKeyboardOwnerPresent(doc: ParentNode | null | undefined): boolean {
  if (!doc || typeof (doc as Document).querySelector !== "function") return false;
  return Boolean((doc as Document).querySelector("[data-cm-room].cm-room-shell"));
}

export function resolveDibayKeyboardLayoutOwner(args: {
  isIosWebKit: boolean;
  cmRoomShellPresent: boolean;
  formSurfaceActive: boolean;
  keyboardOpen: boolean;
}): DibayKeyboardLayoutOwner {
  if (!args.isIosWebKit) {
    return args.formSurfaceActive ? "android_adjust_resize" : "none";
  }
  if (args.cmRoomShellPresent) return "cm_room_vv_band";
  if (args.formSurfaceActive && args.keyboardOpen) return "ios_form_visible_band";
  if (args.formSurfaceActive) return "ios_form_visible_band";
  return "none";
}

/**
 * Resolve visible band for iOS form shells.
 * Does not apply styles — pure function for store + tests.
 */
export function resolveIosFormVisibleBandPx(args: IosFormViewportInputs): IosFormVisibleBandPx {
  const minOpenPx = Math.max(0, args.minOpenPx ?? DIBAY_IOS_FORM_KB_MIN_OPEN_PX);
  const minHeightPx = Math.max(1, args.minHeightPx ?? DIBAY_IOS_FORM_VV_MIN_HEIGHT_PX);
  const layoutHeightPx = Math.max(minHeightPx, Math.round(args.layoutHeightPx));

  const owner = resolveDibayKeyboardLayoutOwner({
    isIosWebKit: args.isIosWebKit,
    cmRoomShellPresent: args.cmRoomShellPresent,
    formSurfaceActive: true,
    keyboardOpen: false,
  });

  if (!args.isIosWebKit) {
    return {
      keyboardOpen: false,
      topPx: 0,
      heightPx: layoutHeightPx,
      insetCssPx: 0,
      bandAuthority: "layout",
      owner: "android_adjust_resize",
    };
  }

  if (args.cmRoomShellPresent) {
    return {
      keyboardOpen: false,
      topPx: 0,
      heightPx: layoutHeightPx,
      insetCssPx: 0,
      bandAuthority: "layout",
      owner: "cm_room_vv_band",
    };
  }

  const vv = args.visualViewport;
  const vvHeight = vv ? Math.max(0, Math.round(vv.height)) : 0;
  const vvTop = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
  const vvOverlayGapPx = vv
    ? Math.max(0, Math.round(layoutHeightPx - (vvTop + vvHeight)))
    : 0;
  const nativeInset = Math.max(0, Math.round(args.nativeInsetCssPx ?? 0));
  const keyboardOpen = vvOverlayGapPx >= minOpenPx || nativeInset >= minOpenPx;

  if (!keyboardOpen) {
    return {
      keyboardOpen: false,
      topPx: 0,
      heightPx: layoutHeightPx,
      insetCssPx: 0,
      bandAuthority: "layout",
      owner,
    };
  }

  // Prefer visualViewport band — do not subtract nativeInset from vv.height (double apply).
  if (vv && vvOverlayGapPx >= minOpenPx) {
    return {
      keyboardOpen: true,
      topPx: vvTop,
      heightPx: Math.max(minHeightPx, vvHeight),
      insetCssPx: vvOverlayGapPx,
      bandAuthority: "visualViewport",
      owner: "ios_form_visible_band",
    };
  }

  // Native-only fallback when vv has not yet shrunk (Capacitor WK lag).
  const nativeHeight = Math.max(minHeightPx, layoutHeightPx - nativeInset);
  return {
    keyboardOpen: true,
    topPx: 0,
    heightPx: nativeHeight,
    insetCssPx: nativeInset,
    bandAuthority: "nativeInset",
    owner: "ios_form_visible_band",
  };
}

export function shouldApplyIosFormLayoutWriter(band: IosFormVisibleBandPx): boolean {
  return band.owner === "ios_form_visible_band";
}

/** Dedupe helper — same open/closed geometry. */
export function iosFormVisibleBandsEqual(
  a: IosFormVisibleBandPx | null,
  b: IosFormVisibleBandPx | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.keyboardOpen === b.keyboardOpen &&
    a.topPx === b.topPx &&
    a.heightPx === b.heightPx &&
    a.insetCssPx === b.insetCssPx &&
    a.bandAuthority === b.bandAuthority &&
    a.owner === b.owner
  );
}
