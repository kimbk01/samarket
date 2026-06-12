"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyInfoLanguageToggleRow } from "@/components/mypage/myinfo/MyInfoLanguageToggleRow";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import {
  MYPAGE_HOME_ACCOUNT_ITEMS,
  MYPAGE_HOME_SERVICE_ITEMS,
  MYPAGE_HOME_STORE_ITEMS,
  MYPAGE_HOME_SUPPORT_ITEMS,
  type MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-config";
import type { MessageKey } from "@/lib/i18n/messages";

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

export function MyInfoStoreMenuSection({ onItemPress }: { onItemPress?: (href: string) => void } = {}) {
  const { safeT } = useI18n();
  return (
    <MyInfoMenuSection title={safeT("mypage_comp_section_store_orders")}>
      {MYPAGE_HOME_STORE_ITEMS.map((item, index) => (
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
