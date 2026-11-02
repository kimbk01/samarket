"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { MyInfoLanguageToggleRow } from "@/components/mypage/myinfo/MyInfoLanguageToggleRow";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import { useMypageHomeRowHref, useMypageHomeRowValue } from "@/components/mypage/home/mypage-home-values-context";
import {
  MYPAGE_HOME_SUPPORT_ITEMS,
  resolveMypageHomeStoreOwnerEntry,
  type MypageHomeLinkMenuItem,
  type MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-config";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";
import { refreshOwnerLiteStore, useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  invalidateMeStoresListDedupedCache,
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

/**
 * 분류 화면·비로그인 공개 행 공용 링크 행 — 값 출처(`valueSource`)가 있으면 로그인 홈 Provider 에서 오른쪽 값을 받는다.
 * 비로그인(Provider 없음)은 값 슬롯 없이 chevron 만.
 */
export function MyInfoHomeLinkRow({
  item,
  first,
  href: hrefProp,
  onItemPress,
}: {
  item: MypageHomeLinkMenuItem;
  first: boolean;
  href?: string;
  onItemPress?: (href: string) => void;
}) {
  const { safeT } = useI18n();
  const valueProps = useMypageHomeRowValue(item.valueSource);
  const href = useMypageHomeRowHref(hrefProp ?? item.href, item.hrefSource);
  return (
    <MyInfoMenuItem
      first={first}
      href={href}
      title={safeT(item.titleKey)}
      icon={renderMypageHomeMenuIcon(item.icon)}
      tone={item.tone ?? "default"}
      testId={item.testId}
      onPress={onItemPress ? () => onItemPress(href) : undefined}
      {...valueProps}
    />
  );
}

export function renderAccountItem(
  item: MypageHomeMenuItemConfig,
  index: number,
  addressesMenuHref: string,
  onItemPress?: (href: string) => void,
) {
  if (item.kind === "language-toggle") {
    return (
      <MyInfoLanguageToggleRow
        key="language-toggle"
        icon={renderMypageHomeMenuIcon(item.icon)}
        first={index === 0}
      />
    );
  }
  if (item.kind === "addresses") {
    return (
      <MyInfoHomeLinkRow
        key="addresses"
        first={index === 0}
        href={addressesMenuHref}
        item={{ href: addressesMenuHref, titleKey: item.titleKey, icon: item.icon, valueSource: item.valueSource }}
        onItemPress={onItemPress}
      />
    );
  }
  return <MyInfoHomeLinkRow key={item.href} first={index === 0} item={item} onItemPress={onItemPress} />;
}




type StoreOwnerGateProps = {
  /** Prefer hub extras when available; otherwise derived from OwnerLite snapshot (no network on /mypage). */
  ownerStoreGate?: OwnerStoreGateState | null;
  ownerStoreGateFirstId?: string | null;
};

/** 매장 행(신청·입점 진행·매장 들어가기) 판정 — Owner gate 표시 전용 (me-stores 목록 조회 없음) */
function useMypageStoreOwnerEntry({ ownerStoreGate: ownerStoreGateProp, ownerStoreGateFirstId: ownerStoreGateFirstIdProp }: StoreOwnerGateProps) {
  const ownerLite = useOwnerLiteStore();

  const deriveFromLive = () => {
    const storesFromLite = ownerLite.ownerStores;
    let stores: StoreRow[] = storesFromLite;
    if (stores.length === 0) {
      const peek = peekMeStoresListClientCache();
      const fromPeek = peek ? parseStoreRowsFromMeStoresJson(peek.json) : null;
      if (fromPeek && fromPeek.length > 0) stores = fromPeek;
    }
    const forGate = stores.map((s) => ({
      id: s.id,
      approval_status: String(s.approval_status ?? ""),
      rejected_reason: s.rejected_reason ?? null,
      revision_note: s.revision_note ?? null,
    }));
    const gate = getOwnerStoreGateState(forGate);
    const firstId = resolveOwnerActiveStoreIdFromOwnedList(stores, null);
    return { gate, firstId };
  };

  const derived = (() => {
    const live = deriveFromLive();
    if (ownerStoreGateProp == null) return live;
    // Cold SSR seed must not block post-approval CTA: live approved wins over stale pending/empty seed.
    if (ownerStoreGateProp.kind !== "approved" && live.gate.kind === "approved") {
      return live;
    }
    return {
      gate: ownerStoreGateProp,
      firstId: ownerStoreGateFirstIdProp?.trim() || live.firstId,
    };
  })();

  return { entry: resolveMypageHomeStoreOwnerEntry(derived.gate, derived.firstId), gate: derived.gate };
}

/** 매장 행 1개 — 권한별 「매장 신청 / 입점 진행 / 매장 들어가기」 */
export function MyInfoStoreOwnerEntryRow({
  first,
  onItemPress,
  ...gateProps
}: StoreOwnerGateProps & { first: boolean; onItemPress?: (href: string) => void }) {
  const { safeT, t } = useI18n();
  const { entry: item, gate } = useMypageStoreOwnerEntry(gateProps);
  const badgeStatus = item.approvalStatusForBadge;
  const accessory =
    badgeStatus != null && String(badgeStatus).trim()
      ? formatStoreApprovalStatusI18n(String(badgeStatus), t)
      : undefined;
  const isStoreEnter = gate.kind === "approved";
  const prepareStoreEnterNavigation = () => {
    invalidateMeStoresListDedupedCache();
    refreshOwnerLiteStore();
  };
  return (
    <MyInfoMenuItem
      first={first}
      href={item.href}
      title={safeT(item.titleKey)}
      icon={renderMypageHomeMenuIcon(item.icon)}
      trailing={accessory ? "status" : "chevron"}
      accessory={accessory}
      pressFeedback
      armed={isStoreEnter}
      onNavigate={isStoreEnter ? prepareStoreEnterNavigation : undefined}
      onPress={
        onItemPress
          ? () => {
              if (isStoreEnter) prepareStoreEnterNavigation();
              onItemPress(item.href);
            }
          : undefined
      }
    />
  );
}



/** 알림 최종 설계 §3 — 고객센터 줄 = 안 읽은 고객센터 글 수 (로그인 회원만 조회). */
export function useCustomerCenterUnreadTotal(): number {
  const [ccUnread, setCcUnread] = useState(0);
  useEffect(() => {
    if (!getSyncViewerUserIdForClient()) return;
    let cancelled = false;
    void fetch("/api/me/settings/notices?unread_counts=1", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((j: { ok?: boolean; unread_counts?: { total?: number } } | null) => {
        if (!cancelled && j?.ok) setCcUnread(Math.max(0, Number(j.unread_counts?.total) || 0));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return ccUnread;
}

/** 고객센터 행 — 안 읽은 글 수 배지 */
export function MyInfoCustomerCenterRow({
  first,
  unread,
  onItemPress,
}: {
  first: boolean;
  unread: number;
  onItemPress?: (href: string) => void;
}) {
  const { safeT } = useI18n();
  const item = MYPAGE_HOME_SUPPORT_ITEMS[0];
  return (
    <MyInfoMenuItem
      first={first}
      href={item.href}
      title={safeT(item.titleKey)}
      icon={renderMypageHomeMenuIcon(item.icon)}
      onPress={onItemPress ? () => onItemPress(item.href) : undefined}
      badge={unread > 0 ? { count: unread, tone: "danger" } : undefined}
    />
  );
}




