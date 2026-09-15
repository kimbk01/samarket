"use client";

/**
 * Admin First Entry cover — occupies unavoidable boot; must NOT add serial wait after app ready.
 *
 * CONTRACT:
 * - Start from LKG as soon as host mounts (under Native cover when present).
 * - displayDurationMs = intentional minimum presentation (default 0).
 * - On shellReady: exit immediately if min already satisfied; else hold remaining only.
 * - FAIL-OPEN: no cache / invalid / media miss → never mounts.
 * - CTA: router.replace after exit; no Intro history entry.
 */

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  canShowProductIntroFromCache,
  scheduleProductIntroCacheRefresh,
} from "@/lib/startup/product-intro-cache";
import { setProductIntroOverlayActive } from "@/lib/startup/product-intro-runtime";
import {
  cssClassForProductIntroEnter,
  cssClassForProductIntroExit,
  productIntroImageWidthPercent,
  resolveProductIntroAction,
  type ProductIntroConfig,
} from "@/lib/startup/product-intro";
import {
  computeProductIntroLayoutBox,
  PRODUCT_INTRO_POPUP_MAX_WIDTH_PX,
} from "@/lib/startup/product-intro-geometry";
import {
  isAppShellReady,
  whenAppShellReady,
} from "@/lib/startup/startup-metrics";

type Phase = "idle" | "enter" | "hold" | "exit" | "done";

const SESSION_SHOWN_KEY = "dibay:startup:product-intro-shown";

function alreadyShownThisEntry(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function markShownThisEntry(): void {
  try {
    sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}

function pickMediaUrl(config: ProductIntroConfig): string {
  // ONE primary image — tablet override only if present; same asset preferred.
  return config.media.mobileUrl ?? config.media.tabletUrl ?? "";
}

export function ProductIntroHost(): ReactElement | null {
  const router = useRouter();
  const { safeT } = useI18n();
  const [shellReady, setShellReady] = useState(() =>
    typeof window !== "undefined" ? isAppShellReady() : false
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [config, setConfig] = useState<ProductIntroConfig | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [layoutTick, setLayoutTick] = useState(0);
  const holdTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);
  const configRef = useRef<ProductIntroConfig | null>(null);
  const presentedAtRef = useRef<number | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  configRef.current = config;

  useEffect(() => {
    if (isAppShellReady()) {
      setShellReady(true);
      return;
    }
    return whenAppShellReady(() => setShellReady(true));
  }, []);

  useEffect(() => {
    const active = phase === "enter" || phase === "hold" || phase === "exit";
    setProductIntroOverlayActive(active);
    return () => setProductIntroOverlayActive(false);
  }, [phase]);

  useEffect(() => {
    const onResize = () => setLayoutTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const beginExit = useCallback(
    (opts?: { skipAnim?: boolean; after?: () => void }) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      clearTimers();
      const cfg = configRef.current;
      const finish = () => {
        setPhase("done");
        setConfig(null);
        const href = pendingHrefRef.current;
        pendingHrefRef.current = null;
        opts?.after?.();
        if (href) {
          try {
            router.replace(href);
          } catch {
            /* fail-open */
          }
        }
      };
      if (
        opts?.skipAnim ||
        !cfg ||
        cfg.animationOut === "none" ||
        cfg.exitDurationMs <= 0
      ) {
        finish();
        return;
      }
      setPhase("exit");
      exitTimerRef.current = window.setTimeout(finish, cfg.exitDurationMs);
    },
    [clearTimers, router]
  );

  /** Start cover ASAP from LKG — do not wait for shellReady. */
  useLayoutEffect(() => {
    if (phase !== "idle") return;
    scheduleProductIntroCacheRefresh();
    if (alreadyShownThisEntry()) {
      setPhase("done");
      return;
    }
    const gate = canShowProductIntroFromCache();
    if (!gate.show) {
      setPhase("done");
      return;
    }
    markShownThisEntry();
    setConfig(gate.config);
    const preferred = pickMediaUrl(gate.config);
    setMediaUrl(preferred || gate.mediaUrl);
    presentedAtRef.current = performance.now();
    setPhase("enter");
  }, [phase]);

  useEffect(() => {
    if (phase !== "enter" || !config) return;
    // Skip enter anim delay when app already ready and min display is 0 — avoid serial flash.
    if (shellReady && config.displayDurationMs <= 0) {
      setPhase("hold");
      return;
    }
    const enterMs = config.animationIn === "none" ? 0 : config.enterDurationMs;
    const t = window.setTimeout(() => setPhase("hold"), Math.max(0, enterMs));
    return () => window.clearTimeout(t);
  }, [phase, config, shellReady]);

  /**
   * Exit authority: shellReady + intentional minimum.
   * remaining = max(0, displayDurationMs - elapsedSinceFirstPaint)
   * Default displayDurationMs=0 → exit as soon as app ready (no added stage).
   */
  useLayoutEffect(() => {
    if (!shellReady) return;
    if (phase !== "enter" && phase !== "hold") return;
    if (!config) return;
    clearTimers();
    const started = presentedAtRef.current ?? performance.now();
    const elapsed = Math.max(0, performance.now() - started);
    const remaining = Math.max(0, config.displayDurationMs - elapsed);
    if (remaining <= 0) {
      // App ready + min satisfied: do not add exit-anim serial wait.
      beginExit({ skipAnim: true });
      return;
    }
    holdTimerRef.current = window.setTimeout(() => beginExit(), remaining);
    return () => {
      if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    };
  }, [shellReady, phase, config, beginExit, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (phase !== "enter" && phase !== "hold" && phase !== "exit") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") beginExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, beginExit]);

  function onCta() {
    if (!config || dismissedRef.current) return;
    const resolved = resolveProductIntroAction(config.action);
    if (resolved.ok) pendingHrefRef.current = resolved.href;
    beginExit();
  }

  if (phase === "idle" || phase === "done" || !config || !mediaUrl) return null;

  const enterClass =
    phase === "enter" && !(shellReady && config.displayDurationMs <= 0)
      ? cssClassForProductIntroEnter(config.animationIn)
      : "";
  const exitClass = phase === "exit" ? cssClassForProductIntroExit(config.animationOut) : "";
  const widthPct = productIntroImageWidthPercent(config);
  const clickable = config.action.type !== "none";
  const durationMs =
    phase === "exit"
      ? config.exitDurationMs
      : phase === "enter"
        ? config.enterDurationMs
        : 0;

  void layoutTick;
  const vw = typeof window !== "undefined" ? window.innerWidth || 390 : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight || 844 : 844;
  const box = computeProductIntroLayoutBox({
    viewportWidth: vw,
    viewportHeight: vh,
    displayMode: config.displayMode,
    widthPercent: widthPct,
    objectFit: config.objectFit,
  });

  return (
    <div
      className="dibay-product-intro-root"
      data-dibay-product-intro="1"
      data-phase={phase}
      data-min-display-ms={config.displayDurationMs}
      role="dialog"
      aria-modal="true"
      aria-label={config.name || "Intro"}
      style={{ backgroundColor: config.backgroundColor }}
    >
      <button
        type="button"
        className={`dibay-product-intro-surface dibay-product-intro-surface--${config.displayMode} ${enterClass} ${exitClass}`}
        style={{
          animationDuration: durationMs > 0 ? `${durationMs}ms` : undefined,
          borderRadius:
            config.displayMode === "card" ? `${config.cornerRadiusPx}px` : undefined,
          width: config.displayMode === "card" ? box.surfaceWidthPx : `${widthPct}%`,
          maxWidth:
            config.displayMode === "card" ? PRODUCT_INTRO_POPUP_MAX_WIDTH_PX : undefined,
          maxHeight: box.surfaceMaxHeightPx,
        }}
        onClick={clickable ? onCta : undefined}
        disabled={!clickable}
        aria-disabled={!clickable}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt=""
          className="dibay-product-intro-image"
          style={{
            objectFit: box.objectFit,
            width: "100%",
            maxHeight: box.surfaceMaxHeightPx,
            height: "auto",
          }}
          draggable={false}
        />
      </button>
      <button type="button" className="dibay-product-intro-skip" onClick={() => beginExit()}>
        {safeT("product_intro_skip", { fallbackKo: "건너뛰기", fallbackEn: "Skip" })}
      </button>
    </div>
  );
}
