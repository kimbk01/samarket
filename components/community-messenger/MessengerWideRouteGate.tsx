"use client";

import type { ReactNode } from "react";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";

/** 768px+ — 본문은 `MessengerResponsiveShell` 좌측 목록이 담당. */
export function MessengerWideRouteGate({ children }: { children: ReactNode }) {
  const isWide = useIsMessengerSplitViewport();
  if (isWide) return null;
  return <>{children}</>;
}
