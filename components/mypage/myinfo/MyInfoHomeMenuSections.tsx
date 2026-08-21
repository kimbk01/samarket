"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { MyInfoLanguageToggleRow } from "@/components/mypage/myinfo/MyInfoLanguageToggleRow";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import {
  MYPAGE_HOME_ACCOUNT_ITEMS,
  MYPAGE_HOME_DANGER_ITEMS,
  MYPAGE_HOME_POLICY_ITEMS,
  MYPAGE_HOME_SERVICE_ITEMS,
  MYPAGE_HOME_STORE_TAIL_ITEMS,
  MYPAGE_HOME_SUPPORT_ITEMS,
  MYPAGE_HOME_TRADE_ITEMS,
  resolveMypageHomeStoreOwnerEntry,
  type MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-config";
import type { MessageKey } from "@/lib/i18n/messages";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";
import { refreshOwnerLiteStore, useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  invalidateMeStoresListDedupedCache,
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

function renderAccountItem(
  item: MypageHomeMenuItemConfig,
  index: number,
  addressesMenuHref: string,
  safeT: (key: MessageKey) => string,
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
      <MyInfoMenuItem
        key="addresses"
        first={index === 0}
        href={addressesMenuHref}
        title={safeT(item.titleKey)}
        icon={renderMypageHomeMenuIcon(item.icon)}
        onPress={onItemPress ? () => onItemPress(addressesMenuHref) : undefined}
      />
    );
  }
  return (
    <MyInfoMenuItem
      key={item.href}
      first={index === 0}
      href={item.href}
      title={safeT(item.titleKey)}
      icon={renderMypageHomeMenuIcon(item.icon)}
      onPress={onItemPress ? () => onItemPress(item.href) : undefined}
    />
  );
}

/** Flow: activity */
export function MyInfoTradeMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_trade")}>
      {MYPAGE_HOME_TRADE_ITEMS.map((item, index) => (
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
    const approvedId =
      stores.find((s) => String(s.approval_status ?? "") === "approved")?.id?.trim() ?? null;
    const preferredId = ownerLite.ownerStore?.id?.trim() || null;
    const firstId =
      gate.kind === "approved"
        ? preferredId || approvedId || stores[0]?.id?.trim() || null
        : stores[0]?.id?.trim() || null;
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
        renderAccountItem(item, index, addressesMenuHref, safeT, onItemPress),
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
        <MyInfoMenuItem
          key={item.href}
          first={index === 0}
          href={item.href}
          title={safeT(item.titleKey)}
          icon={renderMypageHomeMenuIcon(item.icon)}
          tone={item.tone ?? "default"}
          onPress={onItemPress ? () => onItemPress(item.href) : undefined}
        />
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
