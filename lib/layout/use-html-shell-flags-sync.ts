"use client";

import { useLayoutEffect } from "react";
import { requestHtmlShellFlagsSync } from "@/lib/layout/html-shell-flags";

/**
 * D1 F1 — `<html>` 셸 속성(`lib/layout/html-shell-flags.ts`)에 영향을 주는 요소를 그리는 컴포넌트가 호출.
 * 마운트·`key` 변경·해제 때 그리기 전에 DOM 을 다시 읽어 속성을 맞춘다.
 */
export function useHtmlShellFlagsSync(key: string | number | boolean = ""): void {
  useLayoutEffect(() => {
    requestHtmlShellFlagsSync();
    return () => requestHtmlShellFlagsSync();
  }, [key]);
}
