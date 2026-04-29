"use client";

import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  /** 내용 길이에 맞춰 높이 동기화 (스크롤은 페이지 전체) */
  autoGrow?: boolean;
};

/**
 * 값이 바뀔 때마다 `scrollHeight`에 맞춰 높이를 늘리고, 내부 스크롤 대신 폼이 아래로 자연스럽게 길어지게 한다.
 */
export function AutoGrowTextarea({
  autoGrow = true,
  className,
  value,
  onChange,
  placeholder,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!autoGrow) return;
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [autoGrow, value, placeholder]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`${className ?? ""} resize-none overflow-hidden`}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      {...rest}
    />
  );
}
