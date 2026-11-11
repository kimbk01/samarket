"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import { evaluatePublicIdProfileView } from "@/lib/auth/dibay-public-id-ssot";
import { resolveMemberPublicIdUi } from "@/lib/auth/member-public-id-ui-contract";
import { useMemberDiscoverySettings } from "@/lib/auth/use-member-discovery-settings";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import type { ProfileRow } from "@/lib/profile/types";
import { useRepresentativeFullAddressLine } from "@/hooks/use-representative-address-line";
import { invalidateMandatoryAddressGateClientCache, readMandatoryAddressGateNeedsBlock } from "@/lib/addresses/mandatory-address-gate-client";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";
import type { MypageHomeMenuIconId } from "@/lib/mypage/mypage-home-menu-config";
import { MYPAGE_HOME_CARD_CLASS, MYPAGE_HOME_SECTION_HEADER_CLASS, MYPAGE_HOME_SECTION_LABEL_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";

type RequiredStepId = "dibay-id" | "phone" | "address";
type StepState = "done" | "incomplete";
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

function RequiredInfoStatusRow({ row }: { row: RequiredInfoRow }) {
  const isDone = row.state === "done";
  const isIncomplete = row.state === "incomplete";
  const shellClass = isIncomplete
    ? "border-sam-danger/45 bg-sam-danger-soft shadow-[inset_3px_0_0_0_var(--sam-danger)] cursor-pointer active:opacity-90"
    : "border-sam-icon-surface bg-sam-surface";
  const badgeClass = isIncomplete ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-pressed-surface text-sam-primary";

  const openSheet = () => {
    if (isIncomplete && row.onCtaClick) row.onCtaClick();
  };

  return (
    <li
      className={`rounded-ui-rect border ${shellClass}`}
      data-required-step={row.id}
      data-state={row.state}
      data-accordion="false"
      onClick={isIncomplete ? openSheet : undefined}
      onKeyDown={
        isIncomplete
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSheet();
              }
            }
          : undefined
      }
      role={isIncomplete ? "button" : undefined}
      tabIndex={isIncomplete ? 0 : undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={row.id === "address" || isDone ? "mt-0.5 text-sam-primary" : "mt-0.5 text-sam-danger"}>
          {row.id === "address" ? renderMypageHomeMenuIcon(row.icon) : isDone ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : renderMypageHomeMenuIcon(row.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[15px] font-semibold ${isIncomplete ? "text-sam-danger" : "text-sam-fg"}`}>{row.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>{row.badge}</span>
          </div>
          <p className={`mt-1 truncate text-[13px] leading-snug ${isIncomplete ? "text-sam-danger" : "text-sam-muted"}`}>
            {row.value}
          </p>
        </div>
        {row.onCtaClick && row.ctaLabel ? (
          <span className="shrink-0 rounded-full bg-sam-danger px-3.5 py-2 text-[13px] font-semibold text-white">
            {row.ctaLabel}
          </span>
        ) : row.onChangeClick && row.changeLabel ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              row.onChangeClick?.();
            }}
            className="shrink-0 text-[13px] font-semibold text-sam-primary underline underline-offset-2"
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
  const { safeT, t } = useI18n();
  const router = useRouter();
  const { openSheet } = useMypageProfileSheets();
  const [hasDefaultAddress, setHasDefaultAddress] = useState(completion.hasDefaultAddress);
  const addressLineState = useRepresentativeFullAddressLine();

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

  const publicIdView = evaluatePublicIdProfileView(profile);
  const hasDibayId = publicIdView.setupComplete;
  const phoneVerified = hasVerifiedPhone(profile);
  const completeCount = [hasDibayId, phoneVerified, hasDefaultAddress].filter(Boolean).length;
  const bundleComplete = completeCount === 3;

  /** 배지·값·CTA — 회원 아이디 단일 계약 (설계안 v3 §3.8) */
  const discovery = useMemberDiscoverySettings();
  const idUi = resolveMemberPublicIdUi(profile, { allowIdSearch: discovery?.allowIdSearch });
  const dibayIdBadge = !hasDibayId
    ? safeT("mypage_required_status_needed")
    : idUi.badgeKey
      ? t(idUi.badgeKey)
      : safeT("mypage_required_status_done");

  const dibayIdValue = hasDibayId
    ? idUi.atDisplay ?? ""
    : safeT("mypage_required_dibay_id_recover_hint");

  const addressValueText =
    addressLineState.status === "ready" && addressLineState.line?.trim()
      ? addressLineState.line.trim()
      : "";

  const addressValue = addressValueText || safeT("mypage_comp_address_empty_required");

  const rows: RequiredInfoRow[] = [
    {
      id: "dibay-id",
      icon: "user-round",
      title: safeT("mypage_required_dibay_id"),
      state: hasDibayId ? "done" : "incomplete",
      badge: dibayIdBadge,
      value: dibayIdValue,
      ctaLabel: hasDibayId
        ? undefined
        : safeT("mypage_required_dibay_id_recover_btn"),
      onCtaClick: hasDibayId ? undefined : () => openSheet("dibay-id"),
      changeLabel: hasDibayId && idUi.changeCtaKey ? t(idUi.changeCtaKey) : undefined,
      onChangeClick: hasDibayId && idUi.changeCtaKey ? () => openSheet("dibay-id") : undefined,
    },
    {
      id: "phone",
      icon: "phone",
      title: safeT("mypage_required_phone"),
      state: phoneVerified ? "done" : "incomplete",
      badge: phoneVerified
        ? safeT("mypage_required_status_phone_done")
        : safeT("mypage_required_status_phone_needed"),
      value: phoneVerified
        ? resolvePhoneDisplay(profile)
        : safeT("mypage_required_phone_active_hint"),
      ctaLabel: phoneVerified ? undefined : safeT("mypage_required_cta_verify"),
      onCtaClick: phoneVerified ? undefined : () => openSheet("phone"),
    },
    {
      id: "address",
      icon: "address-pin",
      title: safeT("mypage_required_address"),
      state: hasDefaultAddress ? "done" : "incomplete",
      badge: hasDefaultAddress
        ? safeT("mypage_required_status_address_done")
        : safeT("mypage_required_status_address_needed"),
      value: hasDefaultAddress
        ? addressValue
        : safeT("mypage_required_address_active_hint"),
      ctaLabel: hasDefaultAddress ? undefined : safeT("mypage_required_cta_register"),
      onCtaClick: hasDefaultAddress ? undefined : () => router.push(buildMypageAddressesHref("/mypage")),
      changeLabel: hasDefaultAddress ? safeT("mypage_required_change_action") : undefined,
      onChangeClick: hasDefaultAddress ? () => router.push(buildMypageAddressesHref("/mypage")) : undefined,
    },
  ];

  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
      data-testid="mypage-required-info-card"
      data-state={bundleComplete ? "complete" : "incomplete"}
    >
      {bundleComplete ? (
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-1.5`}>
          <p className={`${MYPAGE_HOME_SECTION_LABEL_CLASS} text-sam-primary`} data-testid="mypage-required-info-complete">
            {safeT("mypage_required_bundle_complete")}
          </p>
          <p className="text-[13px] leading-snug text-sam-muted">
            {safeT("mypage_required_complete_desc")}
          </p>
        </div>
      ) : (
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-2.5`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
              {safeT("mypage_required_section_title")}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                completeCount < 3 ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-app text-sam-muted"
              }`}
            >
              {completeCount}/3
            </span>
          </div>
          <p className="text-[13px] leading-snug text-sam-muted">
            {safeT("mypage_required_incomplete_desc")}
          </p>
        </div>
      )}

      <ul className="space-y-2 p-3">
        {rows.map((row) => (
          <RequiredInfoStatusRow key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}
