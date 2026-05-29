"use client";

import { useLayoutEffect } from "react";
import { matchesOwnerCompactShellViewport } from "@/lib/business/owner-compact-shell-viewport";

/**
 * `/stores/owner/*` 모바일 스택 — 문서 루트 스크롤을 막고 내부 `overflow-y-auto` 만 스크롤.
 * (고정 헤더가 transform 조상 밖 `BodyPortal` 에 있어도, 루트가 스크롤되면 체감상 헤더가 늘어남)
 */
export function useOwnerMobileStackViewportLock(ownerStackScrollHost: boolean): void {
  useLayoutEffect(() => {
    if (!ownerStackScrollHost || !matchesOwnerCompactShellViewport()) return;
    const html = document.documentElement;
    const body = document.body;
    const snap = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = snap.htmlOverflow;
      body.style.overflow = snap.bodyOverflow;
      html.style.overscrollBehavior = snap.htmlOverscroll;
      body.style.overscrollBehavior = snap.bodyOverscroll;
    };
  }, [ownerStackScrollHost]);
}
