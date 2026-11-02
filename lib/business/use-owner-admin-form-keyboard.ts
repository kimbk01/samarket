"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import {
  ownerAdminFormBodyPadStyle,
  ownerAdminFormFooterInsetStyle,
} from "@/lib/business/owner-admin-form-keyboard";
import { ownerStoreAdminFooterFixedClass } from "@/lib/business/owner-admin-footer-actions";
import {
  getOwnerBottomNavOccupiesClearance,
  pushOwnerFooterAboveNav,
  subscribeOwnerBottomNavOccupiesClearance,
} from "@/lib/business/owner-bottom-nav-occupancy";

/**
 * Owner admin forms — thin wrapper over Form Keyboard SSOT.
 * Prefer this over calling `useFormKeyboardViewport` + footer class math ad hoc.
 *
 * `aboveBottomNav` 은 사장님 하단 탭이 실제로 떠 있을 때만 적용 — 탭이 숨는 화면(광고 만들기 등)은
 * 화면 하단에 붙인다. 탭 위에 띄우는 동안 탭 스크롤 숨김은 꺼진다 (Owner S-A 2026-11-03).
 */
export function useOwnerAdminFormKeyboard(options?: {
  enabled?: boolean;
  aboveBottomNav?: boolean;
}) {
  const snap = useFormKeyboardViewport({ enabled: options?.enabled !== false });
  const ownerNavMounted = useSyncExternalStore(
    subscribeOwnerBottomNavOccupiesClearance,
    getOwnerBottomNavOccupiesClearance,
    () => false
  );
  const aboveBottomNav = options?.aboveBottomNav === true && ownerNavMounted;

  useEffect(() => {
    if (!aboveBottomNav) return;
    return pushOwnerFooterAboveNav();
  }, [aboveBottomNav]);

  return {
    ...snap,
    formPadStyle: ownerAdminFormBodyPadStyle(snap.effectiveBottomInset),
    footerPadStyle: ownerAdminFormFooterInsetStyle(snap.effectiveBottomInset),
    footerFixedClassName: ownerStoreAdminFooterFixedClass({ aboveBottomNav }),
  };
}
