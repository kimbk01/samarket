"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"footer">, "children" | "className">;

/**
 * flex 하단 입력 섹터 — fixed/sticky/keyboard JS inset 금지.
 * keyboard open/closed padding은 `.cm-room-composer` + viewport shell hook이 담당.
 */
export const ChatComposer = forwardRef<HTMLElement, Props>(function ChatComposer(
  { children, className = "", style, ...rest },
  ref
) {
  return (
    <footer
      ref={ref}
      data-chat-composer
      data-cm-composer
      data-cm-line-composer-footer
      className={`chat-composer ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </footer>
  );
});
