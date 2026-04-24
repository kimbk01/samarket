"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";
import Link from "next/link";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** 좌 → 우 / 우 → 좌 — 닫힘 대기(ms) = CSS transform duration */
const PANEL_SLIDE_MS = 580;
/** 열·닫 동일, 조금 느리게 흐르도록 */
const PANEL_EASE = "cubic-bezier(0.2, 0.65, 0.25, 1)";

/**
 * 1단 헤더 **햄버거** — 왼쪽 밖에서 **좌 → 우**로 밀어 들어온다.
 * 패널 **~90%** + 오른쪽 **~10%**는 **딤 없이** 뒤 페이지가 그대로(색상 유지) 보이게 함.
 * 본문: `SettingsMainContent`.
 */
export function MypageInfoHubSidePanel({ open, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const raf2Ref = useRef(0);

  useLayoutEffect(() => {
    if (!open) {
      setSlideIn(false);
      const t0 = window.setTimeout(() => setVisible(false), PANEL_SLIDE_MS);
      return () => clearTimeout(t0);
    }
    setVisible(true);
    setSlideIn(false);
    /** rAF 2회: -100% 확정 뒤 0% — transition 격리 */
    const raf1 = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => {
        raf2Ref.current = 0;
        setSlideIn(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-0 flex-row"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mypage-info-hub-side-title"
    >
      <div
        className="will-change-transform box-border flex h-full min-h-0 w-[90vw] max-w-full shrink-0 flex-col border-r border-sam-border/80 bg-sam-surface pl-[max(0px,env(safe-area-inset-left,0px))] shadow-[4px_0_24px_rgba(0,0,0,0.1)]"
        style={{
          transform: slideIn ? "translate3d(0,0,0)" : "translate3d(-100%,0,0)",
          transition: `transform ${PANEL_SLIDE_MS}ms ${PANEL_EASE}`,
        }}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-2 border-b border-sam-border px-3 pb-2.5 pt-3 sm:px-4"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
        >
          <div className="min-w-0">
            <h2 id="mypage-info-hub-side-title" className="sam-text-body-lg font-semibold text-sam-fg">
              앱 · 서비스 설정
            </h2>
            <p className="mt-0.5 sam-text-helper leading-snug text-sam-meta">
              언어·국가·차단·캐시 등. 알림·계정은 내정보에서 이동해요.
            </p>
            <Link
              href={buildMypageInfoHubHref()}
              onClick={onClose}
              className="mt-1.5 inline-block sam-text-helper font-medium text-sam-primary hover:underline"
            >
              전체 화면에서 열기
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sam-header-action -mr-0.5 h-10 w-10 shrink-0 text-sam-fg"
            aria-label="닫기"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sam-surface pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
          <SettingsMainContent className="bg-sam-surface pb-8" />
        </div>
      </div>

      <button
        type="button"
        className="min-h-0 min-w-[1.5rem] flex-1 cursor-default border-0 bg-transparent"
        onClick={onClose}
        aria-label="배경 닫기"
      />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
