"use client";

import { memo } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 「입력 중」 한 줄 — 문구 + 점 3개 CSS 애니메이션 (P3 2026-11-18, 레거시 Telegram 머리글·대화 목록과 같은 자리).
 * 머리글 상태 줄·대화 목록 미리보기 자리에서 정적 글자 대신 쓴다. 색·글자 크기는 부모를 따른다.
 * 점은 transform·opacity 만 움직여 줄 높이가 바뀌지 않는다(움직임 줄이기 설정이면 정지).
 */
export const TypingIndicatorLine = memo(function TypingIndicatorLine({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span className={`${Sam.typing.line} ${className}`.trim()} aria-live="polite" data-cm-typing-line="">
      <span className={Sam.typing.label}>{label}</span>
      <span className={Sam.typing.dots} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </span>
  );
});
