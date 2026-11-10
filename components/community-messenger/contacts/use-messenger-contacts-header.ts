"use client";

import { useMemo, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMessengerSplitChrome } from "@/components/community-messenger/MessengerSplitChromeContext";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import type { MainTier1Partial } from "@/contexts/MainTier1ExtrasContext";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 연락처 화면 머리글 — 앱 공통 하위 화면 머리글을 쓴다 (거래·주문 채팅 목록과 같은 방식).
 * - 모바일: 1단 머리글(제목·뒤로 = `resolve-main-tier1`)에 부제·오른쪽 동작만 등록.
 * - 분할(≥768): 분할 상단바에 제목·뒤로·오른쪽 동작 등록.
 * `actions` 는 호출하는 쪽에서 useMemo 로 고정해 넘긴다.
 */
export function useMessengerContactsHeader(opts: {
  titleKey: MessageKey;
  backHref: string;
  subtitle: string | null;
  actions: ReactNode | null;
}): void {
  const { t } = useI18n();
  const isSplit = useIsMessengerSplitViewport();
  const { titleKey, backHref, subtitle, actions } = opts;
  const title = t(titleKey);
  const tier1 = useMemo<MainTier1Partial | null>(
    () => (isSplit ? null : { rightSlot: actions ?? undefined, subtitle: subtitle ?? undefined }),
    [actions, isSplit, subtitle]
  );
  useRegisterMainTier1Header(tier1);
  useRegisterMessengerSplitChrome(isSplit, title, true, backHref, actions);
}
