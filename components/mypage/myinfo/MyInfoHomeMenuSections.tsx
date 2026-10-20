"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { MyInfoLanguageToggleRow } from "@/components/mypage/myinfo/MyInfoLanguageToggleRow";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import { useMypageHomeRowHref, useMypageHomeRowValue } from "@/components/mypage/home/mypage-home-values-context";
import {
  MYPAGE_HOME_ACCOUNT_ITEMS,
  MYPAGE_HOME_ASSET_ITEMS,
  MYPAGE_HOME_COMMUNITY_ITEMS,
  MYPAGE_HOME_DANGER_ITEMS,
  MYPAGE_HOME_POLICY_ITEMS,
  MYPAGE_HOME_SERVICE_ITEMS,
  MYPAGE_HOME_STORE_TAIL_ITEMS,
  MYPAGE_HOME_SUPPORT_ITEMS,
  MYPAGE_HOME_TRADE_ITEMS,
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
 * 홈 링크 행 — 값 출처(`valueSource`)가 있으면 로그인 홈 Provider 에서 오른쪽 값을 받는다.
 * 비로그인(Provider 없음)은 값 슬롯 없이 chevron 만.
 */
function MyInfoHomeLinkRow({
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

function renderAccountItem(
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

/**
 * Flow: activity — 거래 행 + 커뮤니티 행을 **한 그룹**(「활동」)으로 (최종 설계 H0 #2, v2.1 §0.1).
 * 구매 내역 행 없음(마켓 UI-6 HARD LOCK).
 */
export function MyInfoTradeMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  const rows = [...MYPAGE_HOME_TRADE_ITEMS, ...MYPAGE_HOME_COMMUNITY_ITEMS];
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_activity")}>
      {rows.map((item, index) => (
        <MyInfoHomeLinkRow key={item.href} first={index === 0} item={item} onItemPress={onItemPress} />
      ))}
    </MyInfoMenuSection>
  );
}

/**
 * @deprecated 홈은 「활동」 한 그룹(`MyInfoTradeMenuSection`)에 커뮤니티 행을 포함한다 — 기존 import 호환용으로만 유지.
 */
export function MyInfoCommunityMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_community")}>
      {MYPAGE_HOME_COMMUNITY_ITEMS.map((item, index) => (
        <MyInfoHomeLinkRow key={item.href} first={index === 0} item={item} onItemPress={onItemPress} />
      ))}
    </MyInfoMenuSection>
  );
}

/** Flow: assets — 포인트·쿠폰·상품권·홍보/광고·충전·혜택 (값 = summary) */
export function MyInfoAssetMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection
      title={safeT("mypage_comp_asset_summary_title", { fallbackKo: "내 자산", fallbackEn: "My assets" })}
    >
      {MYPAGE_HOME_ASSET_ITEMS.map((item, index) => (
        <MyInfoHomeLinkRow key={item.href} first={index === 0} item={item} onItemPress={onItemPress} />
      ))}
    </MyInfoMenuSection>
  );
}

/** Flow: store_order — first row follows Owner gate (empty/pending/approved); no me-stores list fetch here. */
export function MyInfoStoreMenuSection({
  onItemPress,
  ownerStoreGate: ownerStoreGateProp,
  ownerStoreGateFirstId: ownerStoreGateFirstIdProp,
}: {
  onItemPress?: (href: string) => void;
  /** Prefer hub extras when available; otherwise derived from OwnerLite snapshot (no network on /mypage). */
  ownerStoreGate?: OwnerStoreGateState | null;
  ownerStoreGateFirstId?: string | null;
} = {}) {
  const { safeT, t } = useI18n();
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

  const ownerEntry = resolveMypageHomeStoreOwnerEntry(derived.gate, derived.firstId);
  const rows = [ownerEntry, ...MYPAGE_HOME_STORE_TAIL_ITEMS];

  const prepareStoreEnterNavigation = () => {
    invalidateMeStoresListDedupedCache();
    refreshOwnerLiteStore();
  };

  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_store_orders")}>
      {rows.map((item, index) => {
        const badgeStatus =
          "approvalStatusForBadge" in item ? item.approvalStatusForBadge : undefined;
        const accessory =
          badgeStatus != null && String(badgeStatus).trim()
            ? formatStoreApprovalStatusI18n(String(badgeStatus), t)
            : undefined;
        const isOwnerCta = index === 0;
        const isStoreEnter = isOwnerCta && derived.gate.kind === "approved";
        if (!isOwnerCta) {
          return (
            <MyInfoHomeLinkRow
              key={`${item.titleKey}:${item.href}`}
              first={false}
              item={item}
              onItemPress={onItemPress}
            />
          );
        }
        return (
          <MyInfoMenuItem
            key={`${item.titleKey}:${item.href}`}
            first={index === 0}
            href={item.href}
            title={safeT(item.titleKey)}
            icon={renderMypageHomeMenuIcon(item.icon)}
            trailing={accessory ? "status" : "chevron"}
            accessory={accessory}
            pressFeedback={isOwnerCta}
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
      })}
    </MyInfoMenuSection>
  );
}

/**
 * Flow: account — logout MOVE to Danger (Legacy IA).
 */
export function MyInfoAccountMenuSection({
  addressesMenuHref,
  onItemPress,
}: {
  addressesMenuHref: string;
  onItemPress?: (href: string) => void;
}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_account_menu")}>
      {MYPAGE_HOME_ACCOUNT_ITEMS.map((item, index) =>
        renderAccountItem(item, index, addressesMenuHref, onItemPress),
      )}
    </MyInfoMenuSection>
  );
}

/** Flow: support */
export function MyInfoSupportMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_support")}>
      {MYPAGE_HOME_SUPPORT_ITEMS.map((item, index) => (
        <MyInfoMenuItem
          key={item.href}
          first={index === 0}
          href={item.href}
          title={safeT(item.titleKey)}
          icon={renderMypageHomeMenuIcon(item.icon)}
          onPress={onItemPress ? () => onItemPress(item.href) : undefined}
        />
      ))}
    </MyInfoMenuSection>
  );
}

/** Flow: policy */
export function MyInfoPolicyMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_policy")}>
      {MYPAGE_HOME_POLICY_ITEMS.map((item, index) => (
        <MyInfoMenuItem
          key={item.href}
          first={index === 0}
          href={item.href}
          title={safeT(item.titleKey)}
          icon={renderMypageHomeMenuIcon(item.icon)}
          onPress={onItemPress ? () => onItemPress(item.href) : undefined}
        />
      ))}
    </MyInfoMenuSection>
  );
}

/** Flow: service */
export function MyInfoServiceMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("settings_section_service")}>
      {MYPAGE_HOME_SERVICE_ITEMS.map((item, index) => (
        <MyInfoHomeLinkRow key={item.href} first={index === 0} item={item} onItemPress={onItemPress} />
      ))}
    </MyInfoMenuSection>
  );
}

/**
 * Flow: danger — leave + logout (menu_row + modal). Hub chrome must not host logout.
 */
export function MyInfoDangerMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_danger")}>
      {MYPAGE_HOME_DANGER_ITEMS.map((item, index) => (
        <MyInfoMenuItem
          key={item.href}
          first={index === 0}
          href={item.href}
          title={safeT(item.titleKey)}
          icon={renderMypageHomeMenuIcon(item.icon)}
          tone={item.tone ?? "danger"}
          onPress={onItemPress ? () => onItemPress(item.href) : undefined}
        />
      ))}
      <LogoutActionTrigger
        variant="menu_row"
        surface="card"
        label={safeT("mypage_hub_logout", {
          fallbackKo: "로그아웃",
          fallbackEn: "Log out",
        })}
      />
    </MyInfoMenuSection>
  );
}
