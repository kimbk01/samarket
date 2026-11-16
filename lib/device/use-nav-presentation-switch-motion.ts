"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { DibayNavigationPresentation } from "@/lib/device/dibay-shell-resolver";

/**
 * v5 (Owner 2026-11-16 「가로 세로 테블릿 및 아이패드 변경시 하단 메뉴는 자연스럽게 이동하는 애니메이션」, 시안 v5 승인) —
 * 메뉴 형태(하단 탭 ↔ 왼쪽 세로 메뉴)가 **앱이 떠 있는 동안** 바뀌면(태블릿 회전·창 모양 변경) 들어오는 메뉴에 애니메이션을 준다.
 * - 하단 탭이 되면 아래에서 올라오고, 세로 메뉴가 되면 왼쪽에서 들어온다 (`app/app-desktop-side-nav.css`).
 * - 같은 동안 `<html data-shell-nav-switching>` 로 본문 왼쪽 여백(72 ↔ 0)도 함께 움직인다.
 * - 앱 시작 때(기기 판정 전 → 후)는 움직이지 않는다: 이전·지금 모두 기기 판정이 끝난 상태일 때만.
 * - 「동작 줄이기」 설정이면 CSS 가 끈다.
 */
export const NAV_PRESENTATION_SWITCH_MS = 280;
export const NAV_SWITCHING_HTML_ATTR = "data-shell-nav-switching";

export type NavPresentationEnter = "bottom" | "rail" | null;

export function useNavPresentationSwitchMotion(
  presentation: DibayNavigationPresentation,
  resolved: boolean,
): NavPresentationEnter {
  const prevRef = useRef<{ presentation: DibayNavigationPresentation; resolved: boolean } | null>(null);
  const [enter, setEnter] = useState<NavPresentationEnter>(null);

  useLayoutEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { presentation, resolved };
    if (!prev || !prev.resolved || !resolved || prev.presentation === presentation) return;
    const next: NavPresentationEnter = presentation === "DESKTOP_SIDE_RAIL" ? "rail" : "bottom";
    setEnter(next);
    const html = document.documentElement;
    html.setAttribute(NAV_SWITCHING_HTML_ATTR, next);
    const timer = window.setTimeout(() => {
      setEnter(null);
      html.removeAttribute(NAV_SWITCHING_HTML_ATTR);
    }, NAV_PRESENTATION_SWITCH_MS + 40);
    return () => {
      window.clearTimeout(timer);
      html.removeAttribute(NAV_SWITCHING_HTML_ATTR);
    };
  }, [presentation, resolved]);

  return enter;
}
