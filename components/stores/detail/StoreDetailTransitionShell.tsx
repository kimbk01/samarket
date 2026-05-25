"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, type CSSProperties, type TransitionEvent } from "react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import { STORE_DETAIL_HERO_SHELL_CLASS } from "@/lib/dibay/store-detail-hero-layout";
import {
  STORE_DETAIL_SLIDE_COVER_SHADOW,
  STORE_DETAIL_SLIDE_ENTER_EASING,
  STORE_DETAIL_SLIDE_MS,
} from "@/lib/dibay/store-detail-page-slide";
import type { StoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import {
  getStoreDetailTransitionShellSnapshot,
  subscribeStoreDetailTransitionShell,
} from "@/lib/dibay/store-detail-transition-shell-store";

type ShellSlidePhase = "enter" | "enter-active" | "idle";

function StoreDetailTransitionShellPanel({ seed }: { seed: StoreDetailListSeed }) {
  const [phase, setPhase] = useState<ShellSlidePhase>("enter");
  const rating =
    seed.review_count > 0 ? `${seed.rating_avg.toFixed(1)} (${seed.review_count})` : "- (0)";

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      setPhase((current) => (current === "enter" ? "enter-active" : current));
    });
    const t = window.setTimeout(() => {
      setPhase((current) => (current === "enter-active" ? "idle" : current));
    }, STORE_DETAIL_SLIDE_MS + 48);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);

  const panelStyle = useMemo((): CSSProperties => {
    if (phase === "enter") {
      return {
        transform: "translate3d(100%,0,0)",
        boxShadow: STORE_DETAIL_SLIDE_COVER_SHADOW,
      };
    }
    if (phase === "enter-active") {
      return {
        transform: "translate3d(0,0,0)",
        transition: `transform ${STORE_DETAIL_SLIDE_MS}ms ${STORE_DETAIL_SLIDE_ENTER_EASING}`,
        boxShadow: STORE_DETAIL_SLIDE_COVER_SHADOW,
      };
    }
    return {
      transform: "translate3d(0,0,0)",
      boxShadow: STORE_DETAIL_SLIDE_COVER_SHADOW,
    };
  }, [phase]);

  const onTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== "transform") return;
    if (phase === "enter-active") setPhase("idle");
  };

  return (
    <div
      className="fixed inset-0 z-[45] flex min-h-[100dvh] flex-col bg-white dark:bg-[#18191A]"
      style={panelStyle}
      onTransitionEnd={onTransitionEnd}
      role="presentation"
      aria-hidden
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#ECEFF3] px-3 dark:border-[#2F3133]">
        <span className="h-8 w-8 shrink-0 rounded-ui-rect bg-[#F3F4F6] dark:bg-[#2A2C2E]" />
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-[#111] dark:text-[#F5F5F5]">
          {seed.store_name}
        </h1>
      </header>
      <div className={`${STORE_DETAIL_HERO_SHELL_CLASS} relative shrink-0 bg-[#F3F4F6] dark:bg-[#2A2C2E]`}>
        {seed.hero_image_url ? (
          <DeliveryMediaImage
            src={seed.hero_image_url}
            alt=""
            surface="detail-hero-transition"
            fill
            className="object-cover"
            sizes="100vw"
          />
        ) : null}
      </div>
      <div className="space-y-2 px-4 py-3">
        <p className="text-[15px] font-semibold text-[#111] dark:text-[#F5F5F5]">{seed.store_name}</p>
        <p className="text-[13px] text-[#65676B] dark:text-[#B0B3B8]">
          <span aria-hidden="true">{"\u2605 "}</span>
          {rating}
        </p>
        {seed.tagline ? (
          <p className="line-clamp-2 text-[13px] text-[#65676B] dark:text-[#B0B3B8]">{seed.tagline}</p>
        ) : null}
      </div>
    </div>
  );
}

/** List tap -> perceived shell overlay (list seed) before route transition completes. */
export function StoreDetailTransitionShellPortal(): ReactNode {
  const active = useSyncExternalStore(
    subscribeStoreDetailTransitionShell,
    getStoreDetailTransitionShellSnapshot,
    () => null
  );

  if (!active || typeof document === "undefined") return null;

  return createPortal(<StoreDetailTransitionShellPanel seed={active.seed} />, document.body);
}
