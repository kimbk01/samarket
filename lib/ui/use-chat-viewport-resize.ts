"use client";

import { useLayoutEffect, type RefObject } from "react";
import { resolveLayoutVisibleViewportCssPx } from "@/lib/ui/layout-visible-viewport-px";
import { subscribeSamarketShellKeyboardInsets } from "@/lib/platform/samarket-shell-keyboard";
import { MESSENGER_CHAT_SHELL_MIN_HEIGHT_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

function readSafeAreaInsetBottomPx(): number {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:-9999px;bottom:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);";
  document.body.appendChild(el);
  const pb = parseFloat(getComputedStyle(el).paddingBottom || "0") || 0;
  document.body.removeChild(el);
  return Math.round(pb);
}

type UseChatViewportResizeOptions = {
  enabled: boolean;
  shellRef: RefObject<HTMLElement | null>;
};

/**
 * @see docs/community-messenger-mobile-room-viewport.md
 *
 * dibaY 커뮤니티 메신저 방 모바일 셸 — 높이는 `innerHeight`/`100vh` 단독이 아니라
 * `visualViewport`(+ iOS `offsetTop`)·네이티브 shell inset·composer 실측을 조합한다.
 * Android Chrome(WebView): 루트 `viewport.interactiveWidget = resizes-content` 와 함께 쓰면
 * 키보드 시 레이아웃 뷰포트가 줄어들며, 여기서 vv·innerHeight 로 셸 높이를 맞춘다.
 *
 * 셸 루트에 다음 CSS 변수를 기록한다:
 * - `--chat-viewport-height` 레이아웃 상 보이는 세로 길이(px)
 * - `--chat-keyboard-height` 하단 키보드·가림 영역 추정(px)
 * - `--chat-composer-height` `[data-cm-composer]` 높이(px)
 * - `--chat-trade-dock-height` `[data-cm-trade-dock]` 높이(px) — 타임라인 하단 앵커
 * - `--chat-safe-bottom` `env(safe-area-inset-bottom)` 측정(px) — 레이아웃 수식용; footer의 env()와 중복 적용하지 않도록 주의
 */
const CHAT_VIEWPORT_CSS_VARS = [
  "--chat-viewport-height",
  "--chat-keyboard-height",
  "--chat-composer-height",
  "--chat-trade-dock-height",
  "--chat-safe-bottom",
] as const;

export function useChatViewportResize(opts: UseChatViewportResizeOptions): void {
  const { enabled, shellRef } = opts;

  useLayoutEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell) return;

    let composerObserver: ResizeObserver | null = null;
    let tradeDockObserver: ResizeObserver | null = null;
    let composerEl: HTMLElement | null = null;
    let tradeDockEl: HTMLElement | null = null;
    /** 매 sync마다 DOM 프로브하지 않음 — 회전·해제 시에만 갱신 */
    let safeBottomPx = readSafeAreaInsetBottomPx();

    const applyComposerObserver = () => {
      const next = shell.querySelector<HTMLElement>("[data-cm-composer]");
      if (next === composerEl) return;
      composerObserver?.disconnect();
      composerEl = next;
      composerObserver = null;
      if (next && typeof ResizeObserver !== "undefined") {
        composerObserver = new ResizeObserver(() => sync());
        composerObserver.observe(next);
      }
    };

    const applyTradeDockObserver = () => {
      const next = shell.querySelector<HTMLElement>("[data-cm-trade-dock]");
      if (next === tradeDockEl) return;
      tradeDockObserver?.disconnect();
      tradeDockEl = next;
      tradeDockObserver = null;
      if (next && typeof ResizeObserver !== "undefined") {
        tradeDockObserver = new ResizeObserver(() => sync());
        tradeDockObserver.observe(next);
      }
    };

    const sync = () => {
      applyComposerObserver();
      applyTradeDockObserver();

      const layoutVisibleCssPx = resolveLayoutVisibleViewportCssPx(MESSENGER_CHAT_SHELL_MIN_HEIGHT_PX);
      const inner = window.innerHeight;
      const keyboardCssPx = Math.max(0, Math.round(inner - layoutVisibleCssPx));

      const composer = shell.querySelector<HTMLElement>("[data-cm-composer]");
      const composerH = composer?.offsetHeight ?? 0;
      const tradeDock = shell.querySelector<HTMLElement>("[data-cm-trade-dock]");
      const tradeDockH = tradeDock?.offsetHeight ?? 0;

      shell.style.setProperty("--chat-viewport-height", `${layoutVisibleCssPx}px`);
      shell.style.setProperty("--chat-keyboard-height", `${keyboardCssPx}px`);
      shell.style.setProperty("--chat-composer-height", `${composerH}px`);
      shell.style.setProperty("--chat-trade-dock-height", `${tradeDockH}px`);
      shell.style.setProperty("--chat-safe-bottom", `${safeBottomPx}px`);
    };

    /** 키보드 애니메이션 중 vv 이벤트 폭주 시 한 프레임으로 합침 */
    let syncRafId = 0;
    const scheduleSync = () => {
      cancelAnimationFrame(syncRafId);
      syncRafId = requestAnimationFrame(() => {
        syncRafId = 0;
        sync();
      });
    };

    sync();
    let bootRaf1 = 0;
    let bootRaf2 = 0;
    bootRaf1 = requestAnimationFrame(() => {
      bootRaf2 = requestAnimationFrame(() => {
        sync();
      });
    });

    const vv = window.visualViewport;
    const onWin = () => scheduleSync();
    let orientationRafId = 0;
    const onOrientation = () => {
      /**
       * iOS/Android: `orientationchange` 는 회전 완료 전에 발생한다.
       * 직후 즉시 sync 하면 이전 크기로 한 번 그려진 뒤 다시 올바른 크기로 그려지는
       * 1프레임 깜빡임이 생긴다.
       * → 다음 `resize` 이벤트(회전 완료 후 브라우저 발행)를 기다려 sync 실행.
       * `resize` 이벤트가 200ms 안에 오지 않으면(일부 구형 기기) fallback 으로 바로 sync.
       */
      const handlePostOrientationResize = () => {
        cancelAnimationFrame(orientationRafId);
        window.removeEventListener("resize", handlePostOrientationResize);
        safeBottomPx = readSafeAreaInsetBottomPx();
        scheduleSync();
      };
      window.addEventListener("resize", handlePostOrientationResize, { once: true });
      // fallback: 200ms 이내 resize 미발행 시 직접 sync
      cancelAnimationFrame(orientationRafId);
      orientationRafId = window.setTimeout(() => {
        window.removeEventListener("resize", handlePostOrientationResize);
        safeBottomPx = readSafeAreaInsetBottomPx();
        scheduleSync();
      }, 200) as unknown as number;
    };
    vv?.addEventListener("resize", onWin);
    vv?.addEventListener("scroll", onWin);
    window.addEventListener("orientationchange", onOrientation);
    window.addEventListener("resize", onWin);
    const unsubShell = subscribeSamarketShellKeyboardInsets(() => {
      sync();
    });

    return () => {
      cancelAnimationFrame(syncRafId);
      cancelAnimationFrame(bootRaf1);
      cancelAnimationFrame(bootRaf2);
      clearTimeout(orientationRafId);
      vv?.removeEventListener("resize", onWin);
      vv?.removeEventListener("scroll", onWin);
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("resize", onWin);
      unsubShell();
      composerObserver?.disconnect();
      tradeDockObserver?.disconnect();
      for (const key of CHAT_VIEWPORT_CSS_VARS) {
        shell.style.removeProperty(key);
      }
    };
  }, [enabled, shellRef]);
}
