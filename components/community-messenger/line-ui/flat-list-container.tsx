import type { CSSProperties, ReactNode } from "react";

/** 메신저 플랫 리스트 루트 — 카드·그림자 없이 풀폭 행만 쌓는다. */
export function FlatListContainer({
  children,
  className = "",
  role,
  style,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-cm-flat-list
      className={`w-full bg-[color:var(--messenger-bg)] ${className}`.trim()}
      role={role}
      style={style}
    >
      {children}
    </div>
  );
}
