"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import { evaluatePublicIdProfileView, resolvePublicIdAtDisplay } from "@/lib/auth/dibay-public-id-ssot";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import type { ProfileRow } from "@/lib/profile/types";
import { useRepresentativeAddressPresentation } from "@/hooks/use-representative-address-line";
import { resolveRepresentativeFullAddressLineFromSnapshot } from "@/lib/addresses/address-defaults-snapshot-resolvers";
import { peekFreshAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { invalidateMandatoryAddressGateClientCache, readMandatoryAddressGateNeedsBlock } from "@/lib/addresses/mandatory-address-gate-client";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import type { MypageHomeMenuIconId } from "@/lib/mypage/mypage-home-menu-config";
import { MYPAGE_HOME_CARD_CLASS, MYPAGE_HOME_ICON_WRAP_CLASS, MYPAGE_HOME_SECTION_HEADER_CLASS, MYPAGE_HOME_SECTION_LABEL_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";

type RequiredStepId = "dibay-id" | "phone" | "address";
type StepState = "done" | "active" | "locked";
const PHONE_COUNTRY_CODE_KEY = ["phone", "country", "code"].join("_") as "phone_country_code";
const PHONE_NUMBER_KEY = ["phone", "number"].join("_") as "phone_number";

type RequiredInfoRow = {
  id: RequiredStepId;
  icon: MypageHomeMenuIconId;
  title: string;
  state: StepState;
  badge: string;
  value: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  changeLabel?: string;
  onChangeClick?: () => void;
};

function pickTrimmed(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function resolvePhoneDisplay(profile: ProfileRow): string {
  const formatted = formatProfilePhoneForDisplay({
    phone: profile.phone ?? null,
    [PHONE_COUNTRY_CODE_KEY]: profile.phone_country_code ?? null,
    [PHONE_NUMBER_KEY]: profile.phone_number ?? null,
  }).trim();
  if (formatted) return formatted;

  const phone = pickTrimmed(profile.phone);
  if (phone) return phone;

  const countryCode = pickTrimmed(profile.phone_country_code);
  const phoneNumber = pickTrimmed(profile.phone_number);
  return [countryCode, phoneNumber].filter(Boolean).join(" ").trim();
}

function getActiveStep(args: {
  hasDibayId: boolean;
  hasVerifiedPhone: boolean;
  hasDefaultAddress: boolean;
}): RequiredStepId | null {
  if (!args.hasDibayId) return "dibay-id";
  if (!args.hasVerifiedPhone) return "phone";
  if (!args.hasDefaultAddress) return "address";
  return null;
}

function RequiredInfoStatusRow({ row }: { row: RequiredInfoRow }) {
  const isDone = row.state === "done";
  const isActive = row.state === "active";
  const shellClass = isActive
    ? "border-[#00704A]/28 bg-[#F8FCFA] shadow-[inset_3px_0_0_0_#00704A]"
    : row.state === "locked"
      ? "border-[#E5E0D7] bg-[#FAF8F4] opacity-70"
      : "border-[#D4E9E2] bg-white";
  const badgeClass = isDone
    ? "bg-[#E8F3EE] text-[#00704A]"
    : isActive
      ? "bg-[#FFF3D9] text-[#8A5A00]"
      : "bg-[#F2F0EB] text-[#8B7A67]";

  return (
    <li
      className={`rounded-ui-rect border ${shellClass}`}
      data-required-step={row.id}
      data-state={row.state}
      data-accordion="false"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={isDone ? "mt-0.5 text-[#00704A]" : isActive ? MYPAGE_HOME_ICON_WRAP_CLASS : "mt-0.5 text-[#8B7A67]"}>
          {isDone ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          ) : isActive ? (
            renderMypageHomeMenuIcon(row.icon)
          ) : (
            <Lock className="h-4 w-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[15px] font-semibold ${isActive ? "text-[#00704A]" : "text-[#1E3932]"}`}>{row.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>{row.badge}</span>
          </div>
          <p className="mt-1 truncate text-[13px] leading-snug text-[#6F4E37]">{row.value}</p>
        </div>
        {row.onCtaClick && row.ctaLabel ? (
          <button
            type="button"
            onClick={row.onCtaClick}
            className="shrink-0 rounded-full bg-[#00704A] px-3.5 py-2 text-[13px] font-semibold text-white"
          >
            {row.ctaLabel}
          </button>
        ) : row.onChangeClick && row.changeLabel ? (
          <button
            type="button"
            onClick={row.onChangeClick}
            className="shrink-0 text-[13px] font-semibold text-[#00704A] underline underline-offset-2"
          >
            {row.changeLabel}
          </button>
        ) : null}
      </div>
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
  const { openSheet } = useMypageProfileSheets();
  const [hasDefaultAddress, setHasDefaultAddress] = useState(completion.hasDefaultAddress);
  const addressPresentationState = useRepresentativeAddressPresentation();

  useEffect(() => {
    setHasDefaultAddress(completion.hasDefaultAddress);
  }, [completion.hasDefaultAddress]);

  useEffect(() => {
    const handleAddressesUpdated = async () => {
      invalidateMandatoryAddressGateClientCache();
      const needsBlock = await readMandatoryAddressGateNeedsBlock();
      setHasDefaultAddress(!needsBlock);
      onProfileRefresh?.();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, handleAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, handleAddressesUpdated);
  }, [onProfileRefresh]);

  const hasDibayId = evaluatePublicIdProfileView(profile).setupComplete;
  const phoneVerified = hasVerifiedPhone(profile);
  const activeStep = getActiveStep({ hasDibayId, hasVerifiedPhone: phoneVerified, hasDefaultAddress });
  const completeCount = [hasDibayId, phoneVerified, hasDefaultAddress].filter(Boolean).length;

  const addressValueText = useMemo(() => {
    if (addressPresentationState.status === "ready" && addressPresentationState.presentation) {
      const p = addressPresentationState.presentation;
      return [p.gatePrefix, p.streetBody].filter(Boolean).join(", ").trim();
    }
    const snap = peekFreshAddressDefaultsSnapshot();
    return resolveRepresentativeFullAddressLineFromSnapshot(snap)?.trim() ?? "";
  }, [addressPresentationState]);

  const addressValue = addressValueText || safeT("mypage_comp_address_empty_required", {
    fallbackKo: "대표 주소를 입력 바랍니다",
    fallbackEn: "Please enter your primary address",
  });

  if (activeStep === null) {
    return (
      <section className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`} data-testid="mypage-required-info-card" data-state="complete">
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-1.5`}>
          <p className={`${MYPAGE_HOME_SECTION_LABEL_CLASS} text-[#00704A]`} data-testid="mypage-required-info-complete">
            {safeT("mypage_required_bundle_complete", {
              fallbackKo: "필수정보 · 완료",
              fallbackEn: "Required info · Complete",
            })}
          </p>
          <p className="text-[13px] leading-snug text-[#6F4E37]">
            {safeT("mypage_required_complete_desc", {
              fallbackKo: "필수 정보가 모두 등록되었습니다.",
              fallbackEn: "All required info has been completed.",
            })}
          </p>
        </div>
      </section>
    );
  }

  const makeState = (id: RequiredStepId, done: boolean): StepState => (done ? "done" : activeStep === id ? "active" : "locked");

  const rows: RequiredInfoRow[] = [
    {
      id: "dibay-id",
      icon: "user-round",
      title: safeT("mypage_required_dibay_id", { fallbackKo: "아이디", fallbackEn: "ID" }),
      state: makeState("dibay-id", hasDibayId),
      badge: hasDibayId
        ? safeT("mypage_required_status_done", { fallbackKo: "완료", fallbackEn: "Done" })
        : activeStep === "dibay-id"
          ? safeT("mypage_required_status_needed", { fallbackKo: "필요", fallbackEn: "Required" })
          : safeT("mypage_required_status_waiting", { fallbackKo: "대기", fallbackEn: "Waiting" }),
      value: hasDibayId
        ? resolvePublicIdAtDisplay(profile) ?? ""
        : safeT("mypage_required_dibay_id_active_hint", {
            fallbackKo: "사용할 아이디를 설정해 주세요.",
            fallbackEn: "Set the ID you want to use.",
          }),
      ctaLabel: activeStep === "dibay-id" ? safeT("mypage_required_cta_set", { fallbackKo: "설정", fallbackEn: "Set" }) : undefined,
      onCtaClick: activeStep === "dibay-id" ? () => openSheet("dibay-id") : undefined,
    },
    {
      id: "phone",
      icon: "phone",
      title: safeT("mypage_required_phone", { fallbackKo: "전화번호", fallbackEn: "Phone" }),
      state: makeState("phone", phoneVerified),
      badge: phoneVerified
        ? safeT("mypage_required_status_phone_done", { fallbackKo: "인증 완료", fallbackEn: "Verified" })
        : activeStep === "phone"
          ? safeT("mypage_required_status_phone_needed", { fallbackKo: "인증 필요", fallbackEn: "Verification needed" })
          : safeT("mypage_required_status_waiting", { fallbackKo: "대기", fallbackEn: "Waiting" }),
      value: phoneVerified
        ? resolvePhoneDisplay(profile)
        : safeT("mypage_required_phone_empty", {
            fallbackKo: "전화번호 인증이 필요합니다.",
            fallbackEn: "Phone verification required.",
          }),
      ctaLabel: activeStep === "phone" ? safeT("mypage_required_cta_verify", { fallbackKo: "인증", fallbackEn: "Verify" }) : undefined,
      onCtaClick: activeStep === "phone" ? () => openSheet("phone") : undefined,
    },
    {
      id: "address",
      icon: "address-pin",
      title: safeT("mypage_required_address", { fallbackKo: "기본 주소", fallbackEn: "Default address" }),
      state: makeState("address", hasDefaultAddress),
      badge: hasDefaultAddress
        ? safeT("mypage_required_status_address_done", { fallbackKo: "등록 완료", fallbackEn: "Registered" })
        : activeStep === "address"
          ? safeT("mypage_required_status_address_needed", { fallbackKo: "등록 필요", fallbackEn: "Address needed" })
          : safeT("mypage_required_status_waiting", { fallbackKo: "대기", fallbackEn: "Waiting" }),
      value: hasDefaultAddress
        ? addressValue
        : safeT("mypage_required_address_active_hint", {
            fallbackKo: "대표 주소를 등록해 주세요.",
            fallbackEn: "Please add your default address.",
          }),
      ctaLabel: activeStep === "address" ? safeT("mypage_required_cta_register", { fallbackKo: "등록", fallbackEn: "Register" }) : undefined,
      onCtaClick: activeStep === "address" ? () => openSheet("address") : undefined,
      changeLabel: hasDefaultAddress ? safeT("mypage_required_change_action", { fallbackKo: "변경", fallbackEn: "Change" }) : undefined,
      onChangeClick: hasDefaultAddress ? () => openSheet("address") : undefined,
    },
  ];

  return (
    <section className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`} data-testid="mypage-required-info-card" data-state="incomplete">
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-2.5`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
            {safeT("mypage_required_section_title", {
              fallbackKo: "필수 정보",
              fallbackEn: "Required info",
            })}
          </h2>
          <span className="rounded-full bg-[#F2F0EB] px-2.5 py-1 text-[12px] font-bold text-[#6F4E37]">
            {completeCount}/3
          </span>
        </div>
        <p className="text-[13px] leading-snug text-[#6F4E37]">
          {safeT("mypage_required_incomplete_desc", {
            fallbackKo: "서비스 이용을 위해 아래 정보를 순서대로 완료해 주세요.",
            fallbackEn: "Complete the information below in order to continue using the service.",
          })}
        </p>
      </div>

      <ul className="space-y-2 p-3">
        {rows.map((row) => <RequiredInfoStatusRow key={row.id} row={row} />)}
      </ul>
    </section>
  );
}
