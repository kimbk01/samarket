"use client";

import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

/**
 * Owner Admin DibayBottomSheet — Form Keyboard SSOT inset only.
 * Pass `contentPaddingBottomPx` into `DibayBottomSheet` (existing API).
 * DO NOT add a parallel VV listener or Capacitor keyboard listener here.
 */
export function useOwnerAdminBottomSheetKeyboard(open: boolean) {
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport({ enabled: open });
  return {
    contentPaddingBottomPx: Math.max(0, Math.round(effectiveBottomInset)),
    keyboardOpen,
  };
}
