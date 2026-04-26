"use client";

import type { ReactNode } from "react";

/**
 * 온보딩 단계 공통 셸 — 로그인 직후 강제 단계에서 사용한다 (스펙 9).
 *
 * - 상단 `뒤로가기` 없음 (스펙 2: browser back 금지)
 * - 우측 `나중에 하기` 옵션 — 부모가 onSkip 전달 시에만 노출
 * - 본문은 자식 컴포넌트가 채운다 (주소·프로필 등)
 */
export function OnboardingShell({
  title,
  description,
  onSkip,
  skipLabel = "나중에 하기",
  children,
  footer,
}: {
  title: string;
  description?: string;
  onSkip?: () => void;
  skipLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col bg-sam-app">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sam-border bg-sam-surface px-4 py-3">
        <h1 className="sam-text-section-title font-semibold text-sam-fg">{title}</h1>
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-ui-rect px-2 py-1 sam-text-helper font-medium text-sam-muted transition-transform duration-100 active:scale-[0.985] active:brightness-95"
          >
            {skipLabel}
          </button>
        ) : null}
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-5">
        {description ? (
          <p className="sam-text-body text-sam-muted">{description}</p>
        ) : null}
        {children}
      </main>
      {footer ? <footer className="px-4 pb-5">{footer}</footer> : null}
    </div>
  );
}
