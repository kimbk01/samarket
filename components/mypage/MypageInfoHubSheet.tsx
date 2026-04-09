"use client";

import { useEffect, useState } from "react";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * `/mypage?sheet=info` — 계정 탭·상단 프로필과 **겹치지 않게** 앱·서비스 설정만 표시.
 * (알림·포인트·프로필 편집 등은 내정보 본화면·계정 탭에서 담당)
 */
export function MypageInfoHubSheet({ open, onClose }: Props) {
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setSlideIn(true));
    return () => cancelAnimationFrame(id);
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mypage-info-hub-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="닫기" />
      <div
        className={`relative flex max-h-[min(92vh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[length:var(--ui-radius-rect)] border border-ig-border bg-[var(--sub-bg)] shadow-2xl transition-transform duration-300 ease-out sm:rounded-ui-rect ${
          slideIn ? "translate-y-0 sm:scale-100" : "translate-y-full sm:translate-y-0 sm:scale-95"
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--text-muted)]/30 sm:hidden" aria-hidden />

        <div className="flex shrink-0 flex-col gap-0.5 border-b border-ig-border px-4 py-3">
          <h2 id="mypage-info-hub-title" className="text-[16px] font-semibold text-foreground">
            앱 · 서비스 설정
          </h2>
          <p className="text-[12px] leading-snug text-[var(--text-muted)]">
            언어·국가·차단·캐시 등. 알림·포인트·계정 상세는 내정보 → 계정 탭에서 이동해요.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          <SettingsMainContent className="mx-0 max-w-none" />
        </div>
      </div>
    </div>
  );
}
