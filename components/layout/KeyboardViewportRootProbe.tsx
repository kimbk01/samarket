"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { isSoftKeyboardEditableElement } from "@/lib/layout/bottom-nav-keyboard-hide";
import {
  KEYBOARD_ROOT_OPEN_ATTR,
  shouldDismissKeyboardOnTap,
  shouldReleaseInputFocusOnKeyboardClose,
} from "@/lib/layout/keyboard-root-policy";

/**
 * Keyboard root SSOT leaf — mounted ONCE in `app/layout.tsx` (covers `(main)`, `/login`, `/auth`,
 * `/account`, `/admin`). Renders nothing.
 *
 * Reads the shared Form keyboard store (no own visualViewport listeners) and:
 * 1. publishes `html[data-kb-open]` → CSS `--kb-safe-bottom`;
 * 2. Android: releases input focus when the keyboard closes (hardware back reaches the app);
 * 3. iOS: tap on a non-interactive area of an opt-in surface dismisses the keyboard.
 * Policy: `lib/layout/keyboard-root-policy.ts`.
 */
export function KeyboardViewportRootProbe() {
  const pathname = usePathname();
  const { keyboardOpen } = useFormKeyboardViewport();
  const [focused, setFocused] = useState<Element | null>(null);
  const prevOpenRef = useRef(keyboardOpen);
  const prevWidthRef = useRef(typeof window === "undefined" ? 0 : window.innerWidth);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    setFocused(document.activeElement);
    const onFocusIn = (e: FocusEvent) => {
      setFocused(e.target instanceof Element ? e.target : document.activeElement);
    };
    const onFocusOut = (e: FocusEvent) => {
      setFocused(e.relatedTarget instanceof Element ? e.relatedTarget : null);
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  const kbOpen = keyboardOpen && isSoftKeyboardEditableElement(focused as HTMLInputElement | null);

  useEffect(() => {
    const root = document.documentElement;
    if (kbOpen) root.setAttribute(KEYBOARD_ROOT_OPEN_ATTR, "true");
    else root.removeAttribute(KEYBOARD_ROOT_OPEN_ATTR);
  }, [kbOpen]);

  useEffect(() => () => document.documentElement.removeAttribute(KEYBOARD_ROOT_OPEN_ATTR), []);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = keyboardOpen;
    const width = window.innerWidth;
    const widthChanged = width !== prevWidthRef.current;
    prevWidthRef.current = width;
    const el = document.activeElement;
    if (
      shouldReleaseInputFocusOnKeyboardClose({
        platform: resolveCapacitorShellPlatform(),
        pathname: pathnameRef.current,
        wasOpen,
        open: keyboardOpen,
        widthChanged,
        activeElement: el,
      }) &&
      el instanceof HTMLElement
    ) {
      el.blur();
    }
  }, [keyboardOpen]);

  useEffect(() => {
    if (resolveCapacitorShellPlatform() !== "ios") return;
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t?.clientX ?? 0;
      startY = t?.clientY ?? 0;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const movePx = t ? Math.hypot(t.clientX - startX, t.clientY - startY) : Infinity;
      const active = document.activeElement;
      const target = e.target instanceof Element ? e.target : null;
      if (
        shouldDismissKeyboardOnTap({
          platform: "ios",
          pathname: pathnameRef.current,
          editableFocused: isSoftKeyboardEditableElement(active as HTMLInputElement | null),
          movePx,
          target,
        }) &&
        active instanceof HTMLElement
      ) {
        active.blur();
      }
    };
    document.addEventListener("touchstart", onStart, { capture: true, passive: true });
    document.addEventListener("touchend", onEnd, { capture: true, passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart, true);
      document.removeEventListener("touchend", onEnd, true);
    };
  }, []);

  return null;
}
