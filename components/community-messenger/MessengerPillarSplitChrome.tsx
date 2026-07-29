"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMessengerSplitChrome } from "@/components/community-messenger/MessengerSplitChromeContext";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { resolveTier1BarLabel } from "@/lib/layout/resolve-tier1-bar-label";
import {
  parseMessengerEntryOrigin,
  readStoredMessengerEntryOrigin,
  resolveMessengerHomeTier1BackHref,
} from "@/lib/community-messenger/messenger-entry-origin";

/**
 * ≥768 Domain trade/delivery 목록 — `MessengerSplitTopBar` 에 제목·뒤로가기 등록.
 * (인박스는 `useCommunityMessengerHomeShellEffects` 가 담당; Domain gate 는 Home 을 안 탐)
 */
export function MessengerPillarSplitChrome({ pillar }: { pillar: "trade" | "delivery" }) {
  const isSplit = useIsMessengerSplitViewport();
  const { t, tt } = useI18n();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from")?.trim() ?? "";

  const titleText = useMemo(
    () =>
      pillar === "trade"
        ? resolveTier1BarLabel(t, tt, "nav_trade_chat_label") ?? ""
        : resolveTier1BarLabel(t, tt, "nav_chat_order_compact") ?? "",
    [pillar, t, tt]
  );

  const backHref = useMemo(
    () =>
      resolveMessengerHomeTier1BackHref({
        pillar,
        mainSection: "chats",
        origin: parseMessengerEntryOrigin(fromParam || null) ?? readStoredMessengerEntryOrigin(),
      }),
    [fromParam, pillar]
  );

  useRegisterMessengerSplitChrome(isSplit, titleText, true, backHref, null);

  return null;
}
