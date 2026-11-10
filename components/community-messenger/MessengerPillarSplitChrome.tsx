"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMessengerSplitChrome } from "@/components/community-messenger/MessengerSplitChromeContext";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { resolveTier1BarLabel } from "@/lib/layout/resolve-tier1-bar-label";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import type { MainTier1Partial } from "@/contexts/MainTier1ExtrasContext";
import {
  parseMessengerEntryOrigin,
  readStoredMessengerEntryOrigin,
  resolveMessengerHomeTier1BackHref,
} from "@/lib/community-messenger/messenger-entry-origin";

/** 머리글 제목 키 — 모바일 1단(`resolve-main-tier1`)·분할 머리글이 같은 키 (채팅 시안 4판 「주문 채팅」 띄어 씀) */
export const MESSENGER_PILLAR_TITLE_KEYS = {
  trade: "nav_trade_chat_label",
  delivery: "community_messenger_order_chats",
} as const;

export type MessengerPillarMarkAllState = {
  /** 안 읽은 방이 하나라도 있으면 true — 없으면 회색·눌리지 않음 */
  canMarkAll: boolean;
  busy: boolean;
  onMarkAll: () => void;
};

/** 머리글 오른쪽 글자 동작 「모두 읽음」 — 14px · 600 · 초록, 안 읽은 방이 없으면 회색 (채팅 시안 4판 「9」「10」) */
function MessengerPillarMarkAllReadAction({ canMarkAll, busy, onMarkAll }: MessengerPillarMarkAllState) {
  const { t } = useI18n();
  const disabled = !canMarkAll || busy;
  return (
    <button
      type="button"
      className={`flex min-h-[44px] items-center whitespace-nowrap px-3 text-[14px] font-semibold ${
        disabled ? "text-sam-muted" : "text-sam-primary"
      }`}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onMarkAll}
      data-cm-pillar-mark-all-read=""
    >
      {t("common_mark_all_read")}
    </button>
  );
}

/**
 * 거래·주문 채팅 목록 머리글 — 앱 공통 하위 화면 머리글(설계서 v3 §12: 뒤로 48 · 제목 가운데 17/600 · 오른쪽 동작).
 * - 모바일: 1단 `RegionBar` → `DetailHeader` 오른쪽 칸에 「모두 읽음」만 등록 (제목·뒤로는 `resolve-main-tier1` 주소 표).
 * - 분할(≥768): `MessengerSplitTopBar` 에 제목·뒤로·「모두 읽음」 등록.
 * 목록(gate)이 안 읽은 방·진행 상태·실행 함수를 가진 쪽이라 gate 가 부른다.
 */
export function useMessengerPillarHeaderChrome(
  pillar: "trade" | "delivery",
  markAll: MessengerPillarMarkAllState
): void {
  const isSplit = useIsMessengerSplitViewport();
  const { t, tt } = useI18n();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from")?.trim() ?? "";
  const { canMarkAll, busy, onMarkAll } = markAll;

  const titleText = useMemo(
    () => resolveTier1BarLabel(t, tt, MESSENGER_PILLAR_TITLE_KEYS[pillar]) ?? "",
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

  const actionNode = useMemo(
    () => <MessengerPillarMarkAllReadAction canMarkAll={canMarkAll} busy={busy} onMarkAll={onMarkAll} />,
    [busy, canMarkAll, onMarkAll]
  );

  const tier1 = useMemo<MainTier1Partial | null>(
    () => (isSplit ? null : { rightSlot: actionNode }),
    [actionNode, isSplit]
  );
  useRegisterMainTier1Header(tier1);

  useRegisterMessengerSplitChrome(isSplit, titleText, true, backHref, actionNode);
}
