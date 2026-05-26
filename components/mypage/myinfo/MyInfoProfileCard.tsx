"use client";

import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";
import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { AddressPhCardLineText } from "@/components/addresses/AddressPhCardLineText";
import {
  MYPAGE_HOME_ADDRESS_ROW_CLASS,
  MYPAGE_HOME_CARD_FOOTER_CLASS,
  MYPAGE_HOME_GHOST_BTN_CLASS,
  MYPAGE_HOME_OUTLINE_BTN_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * 내정보 프로필 — 스타벅스 팔레트 · 프로필 편집과 동일 타이포 · 하단 액션(수정·로그아웃).
 */
export function MyInfoProfileCard({
  avatarUrl,
  displayName,
  atUsername,
  addressPresentation,
  addressFallbackLine,
  onAddressPress,
  editHref,
  rightMetaSlot,
  onLogoutPress,
}: {
  avatarUrl: string | null;
  displayName: string;
  atUsername?: string | null;
  addressPresentation?: AddressBookCardPresentation | null;
  addressFallbackLine?: string;
  onAddressPress?: () => void;
  editHref: string;
  rightMetaSlot?: React.ReactNode;
  onLogoutPress?: () => void;
}) {
  const { t } = useI18n();
  const hasPresentation = Boolean(addressPresentation?.gatePrefix || addressPresentation?.streetBody);
  const fallback = (addressFallbackLine ?? "").trim();
  const placeholderDash = t("mypage_comp_placeholder_dash");

  const addressLine = (
    <span className={`min-w-0 flex-1 line-clamp-2 break-words ${MYINFO_TYPO.subText}`}>
      {hasPresentation ? (
        <AddressPhCardLineText presentation={addressPresentation ?? null} />
      ) : fallback ? (
        fallback
      ) : (
        placeholderDash
      )}
    </span>
  );

  return (
    <article className={MYINFO_SURFACE.profileCard}>
      <div className={`${MYINFO_SURFACE.cardPad} space-y-4`}>
        <div className="flex items-start gap-3.5">
          <Link href={editHref} className="block shrink-0" aria-label={t("mypage_comp_profile_image_aria")}>
            <SamarketUserAvatar avatarUrl={avatarUrl} sizePx={72} badge="verified" alt="" />
          </Link>

          <div className="min-w-0 flex-1 pt-0.5">
            <p className={`${MYINFO_TYPO.profileName} truncate text-left`}>{displayName}</p>
            {atUsername ? (
              <p className={`mt-0.5 truncate text-left ${MYINFO_TYPO.handle}`}>{atUsername}</p>
            ) : null}
            {rightMetaSlot ? <div className="mt-2.5 flex justify-start">{rightMetaSlot}</div> : null}
          </div>
        </div>

        {onAddressPress ? (
          <button
            type="button"
            onClick={onAddressPress}
            className={MYPAGE_HOME_ADDRESS_ROW_CLASS}
            aria-label={t("mypage_comp_address_change_aria")}
          >
            <AddressKindHeadPin kind="master" className="mt-0.5 shrink-0" />
            {addressLine}
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#00704A]/50" aria-hidden />
          </button>
        ) : (
          <div className={MYPAGE_HOME_ADDRESS_ROW_CLASS}>
            <AddressKindHeadPin kind="master" className="mt-0.5 shrink-0" />
            {addressLine}
          </div>
        )}
      </div>

      <div className={MYPAGE_HOME_CARD_FOOTER_CLASS}>
        <Link href={editHref} className={MYPAGE_HOME_OUTLINE_BTN_CLASS}>
          {t("mypage_comp_profile_edit")}
        </Link>
        {onLogoutPress ? (
          <button
            type="button"
            onClick={onLogoutPress}
            className={MYPAGE_HOME_GHOST_BTN_CLASS}
            aria-label={t("mypage_comp_settings_block_logout")}
          >
            <LogOut className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden />
            <span>{t("mypage_comp_settings_block_logout")}</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
