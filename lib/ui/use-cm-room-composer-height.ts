"use client";

import { useEffect, type RefObject } from "react";

type Options = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

function measureBlockHeight(el: HTMLElement | null | undefined): number {
  if (!el) return 0;
  return Math.max(0, Math.round(el.getBoundingClientRect().height));
}

/**
 * Composer·trade dock 실측 → shell CSS 변수.
 * flex sibling composer — scroll-padding은 trade dock + tail gap만 (composer height는 scrollIntoView 보조).
 */
export function useCmRoomComposerHeight(opts: Options): void {
  const { enabled, shellRef } = opts;

  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const sync = () => {
      const composerEl = shell.querySelector<HTMLElement>(".cm-room-composer");
      const tradeDockEl = shell.querySelector<HTMLElement>("[data-cm-trade-dock]");
      const composerPx = measureBlockHeight(composerEl);
      const tradeDockPx = measureBlockHeight(tradeDockEl);
      const tailGapPx = 12;

      shell.style.setProperty("--chat-composer-height", `${composerPx}px`);
      shell.style.setProperty("--cm-trade-dock-height", `${tradeDockPx}px`);
      shell.style.setProperty(
        "--cm-timeline-scroll-padding-bottom",
        `${Math.max(tailGapPx, tradeDockPx + tailGapPx)}px`
      );
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };

    sync();
    const ro = new ResizeObserver(schedule);
    const composerEl = shell.querySelector(".cm-room-composer");
    const tradeDockEl = shell.querySelector("[data-cm-trade-dock]");
    if (composerEl) ro.observe(composerEl);
    if (tradeDockEl) ro.observe(tradeDockEl);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      shell.style.removeProperty("--chat-composer-height");
      shell.style.removeProperty("--cm-trade-dock-height");
      shell.style.removeProperty("--cm-timeline-scroll-padding-bottom");
    };
  }, [enabled, shellRef]);
}
