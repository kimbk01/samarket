"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  isDibayChromeSharedPath,
  resolveDibayTabDomainForPath,
  useDibayDomainChromeId,
} from "@/lib/ui/dibay-domain-chrome";
import { recordDibayChromeEntryTab } from "@/lib/ui/dibay-chrome-entry-tab";

/**
 * 헤더 SSOT 3단계 — 문서 루트(`<html data-dibay-domain>`)에 지금 화면의 도메인 색을 단다.
 * 셸 밖에서 그리는 헤더(포털·채팅방·작성기·검색 등)도 `[data-dibay-domain]` 색 변수를 그대로 이어받는다.
 * 탭 화면에 있을 때 그 탭을 기록 → 공용 화면(알림·검색 등)이 들어온 탭 색을 쓴다(C2).
 * 색 변수만 바꾼다 — 화면·동작 변화 없음.
 */
export function DibayDomainChromeRootSync() {
  const pathname = usePathname();
  const domainId = useDibayDomainChromeId(pathname);

  useLayoutEffect(() => {
    if (isDibayChromeSharedPath(pathname)) return;
    const tab = resolveDibayTabDomainForPath(pathname);
    if (tab) recordDibayChromeEntryTab(tab);
  }, [pathname]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (domainId === "other") root.removeAttribute("data-dibay-domain");
    else root.setAttribute("data-dibay-domain", domainId);
  }, [domainId]);

  return null;
}
