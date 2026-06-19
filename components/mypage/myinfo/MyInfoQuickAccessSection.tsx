"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_HOME_QUICK_ITEMS } from "@/lib/mypage/mypage-home-quick-config";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_QUICK_GRID_CLASS,
  MYPAGE_HOME_QUICK_ICON_CELL_CLASS,
  MYPAGE_HOME_QUICK_ICON_LABEL_CLASS,
  MYPAGE_HOME_QUICK_ICON_WRAP_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";
import { MyInfoMenuItem } from "@/components/mypage/myinfo/MyInfoMenuItem";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";

export function MyInfoQuickAccessSection({
  variant,
  onItemPress,
}: {
  variant: "icons" | "list";
  /** 비로그인 — 탭 시 로그인 유도 */
  onItemPress?: (href: string) => void;
}) {
  const { safeT } = useI18n();
  const title = safeT("mypage_comp_section_quick_features");

  if (variant === "list") {
    return (
      <section className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}>
        <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
          <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>{title}</h2>
        </div>
        <div className="min-h-0">
          {MYPAGE_HOME_QUICK_ITEMS.map((item, index) => (
            <MyInfoMenuItem
              key={item.href}
              first={index === 0}
              href={item.href}
              title={safeT(item.titleKey)}
              icon={renderMypageHomeMenuIcon(item.icon)}
              onPress={onItemPress ? () => onItemPress(item.href) : undefined}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}>
      <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>{title}</h2>
      </div>
      <div className={MYPAGE_HOME_QUICK_GRID_CLASS}>
        {MYPAGE_HOME_QUICK_ITEMS.map((item) =>
          onItemPress ? (
            <button
              key={item.href}
              type="button"
              onClick={() => onItemPress(item.href)}
              className={MYPAGE_HOME_QUICK_ICON_CELL_CLASS}
            >
              <span className={MYPAGE_HOME_QUICK_ICON_WRAP_CLASS}>{renderMypageHomeMenuIcon(item.icon)}</span>
              <span className={MYPAGE_HOME_QUICK_ICON_LABEL_CLASS}>{safeT(item.titleKey)}</span>
            </button>
          ) : (
            <Link key={item.href} href={item.href} className={MYPAGE_HOME_QUICK_ICON_CELL_CLASS}>
              <span className={MYPAGE_HOME_QUICK_ICON_WRAP_CLASS}>{renderMypageHomeMenuIcon(item.icon)}</span>
              <span className={MYPAGE_HOME_QUICK_ICON_LABEL_CLASS}>{safeT(item.titleKey)}</span>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
