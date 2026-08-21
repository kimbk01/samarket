"use client";

import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import {
  ownerAdminFormBodyPadStyle,
  ownerAdminFormFooterInsetStyle,
} from "@/lib/business/owner-admin-form-keyboard";
import { ownerStoreAdminFooterFixedClass } from "@/lib/business/owner-admin-footer-actions";

/**
 * Owner admin forms — thin wrapper over Form Keyboard SSOT.
 * Prefer this over calling `useFormKeyboardViewport` + footer class math ad hoc.
 */
export function useOwnerAdminFormKeyboard(options?: {
  enabled?: boolean;
  aboveBottomNav?: boolean;
}) {
  const snap = useFormKeyboardViewport({ enabled: options?.enabled !== false });
  return {
    ...snap,
    formPadStyle: ownerAdminFormBodyPadStyle(snap.effectiveBottomInset),
    footerPadStyle: ownerAdminFormFooterInsetStyle(snap.effectiveBottomInset),
    footerFixedClassName: ownerStoreAdminFooterFixedClass({
      aboveBottomNav: options?.aboveBottomNav === true,
    }),
  };
}
