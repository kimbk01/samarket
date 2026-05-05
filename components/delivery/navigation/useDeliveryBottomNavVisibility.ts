"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBottomNavScrollHide } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function useKeyboardOrInputFocused(): boolean {
  const [focused, setFocused] = useState(false);
  const vvBaseRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || (t as any)?.isContentEditable) {
        setFocused(true);
      }
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName?.toLowerCase() ?? "";
        if (tag === "input" || tag === "textarea" || (el as any)?.isContentEditable) return;
        setFocused(false);
      }, 0);
    };

    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", onFocusOut, true);

    const vv = window.visualViewport;
    if (vv) {
      vvBaseRef.current = vv.height;
      const onVvResize = () => {
        if (vvBaseRef.current == null) vvBaseRef.current = vv.height;
        const base = vvBaseRef.current ?? vv.height;
        const keyboardLikelyOpen = vv.height < base - 120;
        setFocused((prev) => prev || keyboardLikelyOpen);
        if (!keyboardLikelyOpen) {
          const el = document.activeElement as HTMLElement | null;
          const tag = el?.tagName?.toLowerCase() ?? "";
          if (tag !== "input" && tag !== "textarea" && !(el as any)?.isContentEditable) {
            setFocused(false);
          }
        }
      };
      vv.addEventListener("resize", onVvResize);
      return () => {
        window.removeEventListener("focusin", onFocusIn, true);
        window.removeEventListener("focusout", onFocusOut, true);
        vv.removeEventListener("resize", onVvResize);
      };
    }

    return () => {
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  return focused;
}

export function useDeliveryBottomNavVisibility() {
  const reducedMotion = usePrefersReducedMotion();
  const hiddenByScroll = useBottomNavScrollHide(true);
  const keyboardOrInputFocused = useKeyboardOrInputFocused();

  const hidden = keyboardOrInputFocused || hiddenByScroll;
  const transitionClass = useMemo(() => {
    if (reducedMotion) return "";
    return "transition-transform duration-200 will-change-transform";
  }, [reducedMotion]);

  return {
    hidden,
    transitionClass,
    reducedMotion,
  };
}

