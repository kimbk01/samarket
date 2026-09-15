"use client";

/**
 * Admin Product Intro host — post-shellReady overlay only.
 * FAIL-OPEN: no cache / invalid / media miss → never mounts.
 * Intro is entry state, not a route; CTA uses router.replace.
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
  if (typeof window === "undefined") return config.media.mobileUrl ?? "";
  const w = window.innerWidth || 0;
  if (w >= 768 && config.media.tabletUrl) return config.media.tabletUrl;
  return config.media.mobileUrl ?? "";
}

export function ProductIntroHost(): ReactElement | null {
  const router = useRouter();
  const { safeT } = useI18n();
  const [shellReadyTick, setShellReadyTick] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [config, setConfig] = useState<ProductIntroConfig | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const holdTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);
  const configRef = useRef<ProductIntroConfig | null>(null);
  configRef.current = config;

  useEffect(() => {
    if (isAppShellReady()) {
      setShellReadyTick((n) => n + 1);
      return;
    }
    return whenAppShellReady(() => setShellReadyTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const active = phase === "enter" || phase === "hold" || phase === "exit";
    setProductIntroOverlayActive(active);
    return () => setProductIntroOverlayActive(false);
  }, [phase]);

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
    (after?: () => void) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      clearTimers();
      const cfg = configRef.current;
      if (!cfg || cfg.animationOut === "none" || cfg.exitDurationMs <= 0) {
        setPhase("done");
        setConfig(null);
        after?.();
        return;
      }
      setPhase("exit");
      exitTimerRef.current = window.setTimeout(() => {
        setPhase("done");
        setConfig(null);
        after?.();
      }, cfg.exitDurationMs);
    },
    [clearTimers]
  );

  useLayoutEffect(() => {
    if (shellReadyTick < 1) return;
    scheduleProductIntroCacheRefresh();
    if (phase !== "idle") return;
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
    // Proven-ready media first (mobile LKG). Tablet only if already decoded in cache.
    const preferred = pickMediaUrl(gate.config);
    setMediaUrl(preferred === gate.mediaUrl ? preferred : gate.mediaUrl);
    setPhase("enter");
  }, [shellReadyTick, phase]);

  useEffect(() => {
    if (phase !== "enter" || !config) return;
    const enterMs = config.animationIn === "none" ? 0 : config.enterDurationMs;
    const t = window.setTimeout(() => setPhase("hold"), Math.max(0, enterMs));
    return () => window.clearTimeout(t);
  }, [phase, config]);

  useEffect(() => {
    if (phase !== "hold" || !config) return;
    holdTimerRef.current = window.setTimeout(() => {
      beginExit();
    }, config.displayDurationMs);
    return () => {
      if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    };
  }, [phase, config, beginExit]);

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
    beginExit(() => {
      if (!resolved.ok) return;
      try {
        router.replace(resolved.href);
      } catch {
        /* fail-open */
      }
    });
  }

  if (phase === "idle" || phase === "done" || !config || !mediaUrl) return null;

  const enterClass =
    phase === "enter" ? cssClassForProductIntroEnter(config.animationIn) : "";
  const exitClass = phase === "exit" ? cssClassForProductIntroExit(config.animationOut) : "";
  const widthPct = productIntroImageWidthPercent(config);
  const clickable = config.action.type !== "none";
  const durationMs =
    phase === "exit"
      ? config.exitDurationMs
      : phase === "enter"
        ? config.enterDurationMs
        : 0;

  return (
    <div
      className="dibay-product-intro-root"
      data-dibay-product-intro="1"
      data-phase={phase}
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
          width: config.displayMode === "card" ? `${Math.min(92, widthPct)}%` : "100%",
          maxWidth: config.displayMode === "card" ? 420 : undefined,
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
            objectFit: config.objectFit,
            width: config.displayMode === "fullscreen" ? `${widthPct}%` : "100%",
            maxHeight: config.displayMode === "fullscreen" ? "78vh" : "70vh",
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
