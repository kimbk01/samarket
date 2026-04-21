import type { ReactNode } from "react";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export type AppShellProps = {
  children: ReactNode;
  className?: string;
  /** false면 가로 거터만 제외(풀블리드 리스트 등) */
  gutter?: boolean;
};

/**
 * 메인 컬럼 안 본문 래퍼 — 배경·최소 높이·기본 좌우 거터.
 */
export function AppShell({ children, className, gutter = true }: AppShellProps) {
  const g = gutter ? APP_MAIN_GUTTER_X_CLASS : "";
  return <div className={`min-h-0 min-w-0 flex-1 bg-sam-app text-sam-fg ${g} ${className ?? ""}`.trim()}>{children}</div>;
}
