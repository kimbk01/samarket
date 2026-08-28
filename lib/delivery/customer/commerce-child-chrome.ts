"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";

export type CommerceChildChromeOptions = {
  titleKey: MessageKey;
  backHref: string;
  preferHistoryBack?: boolean;
  rightSlot?: ReactNode;
  stickyBelow?: ReactNode;
};

/** Single child-flow chrome adapter — config only, no header render. */
export function useCommerceChildChrome(opts: CommerceChildChromeOptions) {
  const { t } = useI18n();
  const setExtras = useSetMainTier1ExtrasOptional();
  const title = t(opts.titleKey);

  useLayoutEffect(() => {
    if (!setExtras) return;
    setExtras({
      tier1: {
        title,
        backHref: opts.backHref,
        preferHistoryBack: opts.preferHistoryBack ?? true,
        showHubQuickActions: false,
        rightSlot: opts.rightSlot,
      },
      stickyBelow: opts.stickyBelow,
    });
    return () => setExtras(null);
  }, [
    setExtras,
    title,
    opts.backHref,
    opts.preferHistoryBack,
    opts.rightSlot,
    opts.stickyBelow,
  ]);
}
