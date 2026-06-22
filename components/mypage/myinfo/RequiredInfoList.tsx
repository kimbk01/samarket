"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressPhCardLineText } from "@/components/addresses/AddressPhCardLineText";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import { resolvePublicIdAtDisplay } from "@/lib/auth/dibay-public-id-ssot";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import type { ProfileRow } from "@/lib/profile/types";
import { useRepresentativeAddressPresentation } from "@/hooks/use-representative-address-line";
import { resolveRepresentativeFullAddressLineFromSnapshot } from "@/lib/addresses/address-defaults-snapshot-resolvers";
import { peekFreshAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { MypageHomeMenuIconId } from "@/lib/mypage/mypage-home-menu-config";
import {
  MYPAGE_ADDRESSES_HREF,
  MYPAGE_REQUIRED_PHONE_HREF,
} from "@/lib/mypage/mypage-profile-routes";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_ICON_WRAP_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type RequiredRowDef = {
  id: "dibay-id" | "phone" | "address";
  icon: MypageHomeMenuIconId;
  href: string;
  labelKey: "mypage_required_dibay_id" | "mypage_required_phone" | "mypage_required_address";
  labelKo: string;
  labelEn: string;
  complete: boolean;
  valueText: string;
  valueNode: ReactNode | null;
  emptyHintKey: "mypage_comp_set_dibay_id" | "mypage_required_phone_empty" | "mypage_comp_address_empty_required";
  emptyHintKo: string;
  emptyHintEn: string;
};

function resolveDibayIdDisplay(profile: ProfileRow): string {
  return resolvePublicIdAtDisplay(profile) ?? "";
}

function resolvePhoneDisplay(profile: ProfileRow): string {
  return formatProfilePhoneForDisplay({
    phone: profile.phone ?? null,
    phone_country_code: profile.phone_country_code ?? null,
    phone_number: profile.phone_number ?? null,
  }).trim();
}

function RequiredInfoAccordionRow({
  row,
  profile,
  defaultOpen,
  registerLabel,
  changeLabel,
  onDibayConfirmed,
}: {
  row: RequiredRowDef;
  profile: ProfileRow;
  defaultOpen: boolean;
  registerLabel: string;
  changeLabel: string;
  onDibayConfirmed: () => void | Promise<void>;
}) {
  const { safeT, t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const label = safeT(row.labelKey, { fallbackKo: row.labelKo, fallbackEn: row.labelEn });
  const emptyHint = safeT(row.emptyHintKey, {
    fallbackKo: row.emptyHintKo,
    fallbackEn: row.emptyHintEn,
  });
  const dibayLocked = profile.dibay_id_locked === true;

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, row.complete]);

  const summaryText = row.complete ? row.valueText || emptyHint : emptyHint;

  return (
    <li className="border-b border-[#D4E9E2]/80 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left active:bg-[#E8F3EE] sm:px-5 ${
          row.complete ? "" : "bg-red-50/40"
        }`}
      >
        <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>{renderMypageHomeMenuIcon(row.icon)}</span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-semibold ${row.complete ? "text-[#1E3932]" : "text-red-800"}`}>
            {label}
          </p>
          <p
            className={`mt-0.5 truncate text-[13px] ${
              row.complete ? "text-[#6F4E37]" : "font-medium text-red-700"
            }`}
          >
            {summaryText}
          </p>
        </div>
        {!row.complete ? (
          <span className="inline-flex shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            {safeT("mypage_status_needed", { fallbackKo: "필요", fallbackEn: "Required" })}
          </span>
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#6F4E37]/45 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-t border-[#D4E9E2]/60 bg-[#F2F0EB]/50 px-4 py-3 sm:px-5">
          {row.id === "dibay-id" ? (
            row.complete && dibayLocked ? (
              <div className="space-y-2">
                <div className="min-w-0 break-words text-[14px] font-semibold leading-snug text-[#1E3932]">
                  {row.valueText}
                </div>
                <p className="text-[13px] text-[#6F4E37]">{t("profile_edit_dibay_id_locked_hint")}</p>
              </div>
            ) : (
              <ProfileDibayIdSection
                dibayId={profile.dibay_id ?? null}
                dibayIdLocked={dibayLocked}
                username={profile.username ?? profile.dibay_id ?? null}
                usernameConfirmed={profile.username_confirmed ?? null}
                fieldComplete={row.complete}
                onConfirmed={async (confirmedDibayId) => {
                  if (!confirmedDibayId.trim()) return;
                  await onDibayConfirmed();
                }}
              />
            )
          ) : row.complete ? (
            <div className="space-y-3">
              <div className="min-w-0 break-words text-[14px] leading-snug text-[#1E3932]">
                {row.valueNode ?? row.valueText}
              </div>
              <Link
                href={row.href}
                className="inline-flex min-h-[40px] items-center text-[14px] font-semibold text-[#00704A]"
              >
                {changeLabel}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[14px] leading-snug text-red-700">{emptyHint}</p>
              <Link
                href={row.href}
                className="inline-flex min-h-[40px] items-center rounded-ui-rect bg-[#00704A] px-4 text-[14px] font-semibold text-white"
              >
                {registerLabel}
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function RequiredInfoList({
  profile,
  completion,
  onProfileRefresh,
}: {
  profile: ProfileRow;
  completion: ProfileCompletionState;
  onProfileRefresh?: () => void;
}) {
  const { safeT } = useI18n();
  const addressPresentationState = useRepresentativeAddressPresentation();

  const addressValueText = useMemo(() => {
    if (addressPresentationState.status === "ready" && addressPresentationState.presentation) {
      const p = addressPresentationState.presentation;
      return [p.gatePrefix, p.streetBody].filter(Boolean).join(", ").trim();
    }
    const snap = peekFreshAddressDefaultsSnapshot();
    return resolveRepresentativeFullAddressLineFromSnapshot(snap)?.trim() ?? "";
  }, [addressPresentationState]);

  const addressValueNode =
    addressPresentationState.status === "ready" && addressPresentationState.presentation ? (
      <AddressPhCardLineText presentation={addressPresentationState.presentation} />
    ) : addressValueText ? (
      addressValueText
    ) : (
      safeT("mypage_comp_address_loading", {
        fallbackKo: "대표 주소를 확인하는 중입니다",
        fallbackEn: "Checking default address…",
      })
    );

  const registerLabel = safeT("mypage_required_register_action", {
    fallbackKo: "등록하기",
    fallbackEn: "Register",
  });
  const changeLabel = safeT("mypage_required_change_action", {
    fallbackKo: "변경",
    fallbackEn: "Change",
  });

  const handleDibayConfirmed = useCallback(async () => {
    invalidateMeProfileDedupedCache();
    const fresh = await getMyProfile();
    if (fresh) {
      setSupabaseProfileCache(profileRowToClientProfile(fresh));
    }
    onProfileRefresh?.();
  }, [onProfileRefresh]);

  const rows: RequiredRowDef[] = [
    {
      id: "dibay-id",
      icon: "user-round",
      href: "/mypage/required/dibay-id",
      labelKey: "mypage_required_dibay_id",
      labelKo: "@아이디",
      labelEn: "@ ID",
      complete: completion.hasDibayId,
      valueText: resolveDibayIdDisplay(profile),
      valueNode: null,
      emptyHintKey: "mypage_comp_set_dibay_id",
      emptyHintKo: "아이디를 설정해 주세요",
      emptyHintEn: "Set your @ ID",
    },
    {
      id: "phone",
      icon: "phone",
      href: MYPAGE_REQUIRED_PHONE_HREF,
      labelKey: "mypage_required_phone",
      labelKo: "전화번호",
      labelEn: "Phone",
      complete: completion.hasVerifiedPhone,
      valueText: resolvePhoneDisplay(profile),
      valueNode: null,
      emptyHintKey: "mypage_required_phone_empty",
      emptyHintKo: "전화번호 인증이 필요합니다",
      emptyHintEn: "Phone verification required",
    },
    {
      id: "address",
      icon: "address-pin",
      href: MYPAGE_ADDRESSES_HREF,
      labelKey: "mypage_required_address",
      labelKo: "기본 주소",
      labelEn: "Default address",
      complete: completion.hasDefaultAddress,
      valueText: addressValueText,
      valueNode: addressValueNode,
      emptyHintKey: "mypage_comp_address_empty_required",
      emptyHintKo: "대표 주소를 입력해 주세요",
      emptyHintEn: "Please add your default address",
    },
  ];

  const completeRows = rows.filter((row) => row.complete);
  const incompleteRows = rows.filter((row) => !row.complete);

  return (
    <section className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}>
      <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
          {safeT("mypage_required_section_title", {
            fallbackKo: "필수 정보",
            fallbackEn: "Required info",
          })}
        </h2>
      </div>

      {completeRows.length > 0 ? (
        <ul>
          {completeRows.map((row) => (
            <RequiredInfoAccordionRow
              key={row.id}
              row={row}
              profile={profile}
              defaultOpen={false}
              registerLabel={registerLabel}
              changeLabel={changeLabel}
              onDibayConfirmed={handleDibayConfirmed}
            />
          ))}
        </ul>
      ) : null}

      {incompleteRows.length > 0 ? (
        <>
          {completeRows.length > 0 ? <div className="border-t border-[#D4E9E2]/80" aria-hidden /> : null}
          <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} bg-[#F2F0EB]/40`}>
            <div className="flex items-center gap-2.5">
              <span className={`${MYPAGE_HOME_ICON_WRAP_CLASS} bg-red-50 text-red-600`}>
                {renderMypageHomeMenuIcon("info")}
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-red-700">
                {safeT("mypage_required_incomplete_header", {
                  fallbackKo: "등록이 필요한 항목",
                  fallbackEn: "Needs registration",
                })}
              </p>
            </div>
          </div>
          <ul>
            {incompleteRows.map((row) => (
              <RequiredInfoAccordionRow
                key={row.id}
                row={row}
                profile={profile}
                defaultOpen
                registerLabel={registerLabel}
                changeLabel={changeLabel}
                onDibayConfirmed={handleDibayConfirmed}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
