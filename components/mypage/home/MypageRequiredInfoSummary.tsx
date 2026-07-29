"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { evaluatePublicIdProfileView, resolvePublicIdAtDisplay } from "@/lib/auth/dibay-public-id-ssot";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import type { RequiredInfoStatus } from "@/lib/mypage/mypage-home-snapshot";
import type { MypageHomeMenuIconId } from "@/lib/mypage/mypage-home-menu-config";
import { useRepresentativeAddressPresentation } from "@/hooks/use-representative-address-line";
import { resolveRepresentativeFullAddressLineFromSnapshot } from "@/lib/addresses/address-defaults-snapshot-resolvers";
import { peekFreshAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type RequiredStepId = "dibay-id" | "phone" | "address";

type RequiredInfoRow = {
  id: RequiredStepId;
  icon: MypageHomeMenuIconId;
  title: string;
  status: RequiredInfoStatus;
  badge: string;
  value: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  changeLabel?: string;
  onChangeClick?: () => void;
};

const PHONE_COUNTRY_CODE_KEY = ["phone", "country", "code"].join("_") as "phone_country_code";
const PHONE_NUMBER_KEY = ["phone", "number"].join("_") as "phone_number";

function pickTrimmed(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function resolvePhoneDisplay(profile: NonNullable<MypageHomeProjection["profile"]>): string {
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
  const isComplete = row.status === "complete";
  const isRequired = row.status === "required";
  const isUnknown = row.status === "unknown";

  const shellClass = isRequired
    ? "border-[#E53935]/45 bg-[#FFF5F5] shadow-[inset_3px_0_0_0_#E53935] cursor-pointer active:opacity-90"
    : "border-[#D4E9E2] bg-white";
  const badgeClass = isRequired
    ? "bg-[#FDECEC] text-[#C62828]"
    : isUnknown
      ? "bg-[#F2F0EB] text-[#6F4E37]"
      : "bg-[#E8F3EE] text-[#00704A]";

  const openSheet = () => {
    if (isRequired && row.onCtaClick) row.onCtaClick();
  };

  return (
    <li
      className={`rounded-ui-rect border ${shellClass}`}
      data-required-step={row.id}
      data-state={row.status}
      onClick={isRequired ? openSheet : undefined}
      onKeyDown={
        isRequired
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSheet();
              }
            }
          : undefined
      }
      role={isRequired ? "button" : undefined}
      tabIndex={isRequired ? 0 : undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={isComplete ? "mt-0.5 text-[#00704A]" : isRequired ? "mt-0.5 text-[#C62828]" : "mt-0.5 text-[#6F4E37]"}>
          {isComplete ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : renderMypageHomeMenuIcon(row.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[15px] font-semibold ${isRequired ? "text-[#B71C1C]" : "text-[#1E3932]"}`}>{row.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>{row.badge}</span>
          </div>
          <p className={`mt-1 truncate text-[13px] leading-snug ${isRequired ? "text-[#C62828]" : "text-[#6F4E37]"}`}>
            {row.value}
          </p>
        </div>
        {row.onCtaClick && row.ctaLabel && isRequired ? (
          <span className="shrink-0 rounded-full bg-[#C62828] px-3.5 py-2 text-[13px] font-semibold text-white">
            {row.ctaLabel}
          </span>
        ) : row.onChangeClick && row.changeLabel && isComplete ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              row.onChangeClick?.();
            }}
            className="shrink-0 text-[13px] font-semibold text-[#00704A] underline underline-offset-2"
          >
            {row.changeLabel}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** 필수 정보 — unknown 에서는 빨간 “등록 필요” 금지 */
export function MypageRequiredInfoSummary({
  projection,
}: {
  projection: MypageHomeProjection | null;
}) {
  const { safeT } = useI18n();
  const { openSheet } = useMypageProfileSheets();
  const addressPresentationState = useRepresentativeAddressPresentation();

  const phoneStatus: RequiredInfoStatus = projection?.phoneStatus ?? "unknown";
  const addressStatus: RequiredInfoStatus = projection?.addressStatus ?? "unknown";
  const hasDibayId = projection?.hasDibayId === true;
  const dibayStatus: RequiredInfoStatus = !projection
    ? "unknown"
    : hasDibayId
      ? "complete"
      : "required";

  const publicIdView = projection?.profile
    ? evaluatePublicIdProfileView(projection.profile)
    : null;

  const completeCount = [dibayStatus, phoneStatus, addressStatus].filter((s) => s === "complete").length;
  const knownCount = [dibayStatus, phoneStatus, addressStatus].filter((s) => s !== "unknown").length;
  const bundleComplete = knownCount === 3 && completeCount === 3;

  const addressValueText = useMemo(() => {
    if (addressPresentationState.status === "ready" && addressPresentationState.presentation) {
      const p = addressPresentationState.presentation;
      return [p.gatePrefix, p.streetBody].filter(Boolean).join(", ").trim();
    }
    const snap = peekFreshAddressDefaultsSnapshot();
    return resolveRepresentativeFullAddressLineFromSnapshot(snap)?.trim() ?? "";
  }, [addressPresentationState]);

  const checkingLabel = safeT("mypage_required_status_checking", {
    fallbackKo: "확인 중",
    fallbackEn: "Checking",
  });

  const dibayIdBadge =
    dibayStatus === "unknown"
      ? checkingLabel
      : dibayStatus === "required"
        ? safeT("mypage_required_status_needed", { fallbackKo: "필요", fallbackEn: "Required" })
        : publicIdView?.autoAssigned && publicIdView.canChangeOnce
          ? safeT("mypage_required_dibay_id_auto_assigned_badge", {
              fallbackKo: "자동 부여됨",
              fallbackEn: "Auto-assigned",
            })
          : publicIdView?.changeComplete
            ? safeT("mypage_required_dibay_id_change_complete_badge", {
                fallbackKo: "변경 완료",
                fallbackEn: "Change complete",
              })
            : safeT("mypage_required_status_done", { fallbackKo: "완료", fallbackEn: "Done" });

  const dibayIdValue =
    dibayStatus === "unknown"
      ? safeT("mypage_required_value_checking", { fallbackKo: "확인 중…", fallbackEn: "Checking…" })
      : hasDibayId
        ? projection?.username ??
          (projection?.profile ? resolvePublicIdAtDisplay(projection.profile) : null) ??
          ""
        : safeT("mypage_required_dibay_id_recover_hint", {
            fallbackKo: "아이디가 없습니다. 복구가 필요합니다.",
            fallbackEn: "No ID found. Recovery is required.",
          });

  const phoneValue =
    phoneStatus === "unknown"
      ? safeT("mypage_required_value_checking", { fallbackKo: "확인 중…", fallbackEn: "Checking…" })
      : phoneStatus === "complete" && projection?.profile
        ? resolvePhoneDisplay(projection.profile)
        : safeT("mypage_required_phone_active_hint", {
            fallbackKo: "전화번호 인증이 필요합니다.",
            fallbackEn: "Phone verification is required.",
          });

  const addressValue =
    addressStatus === "unknown"
      ? safeT("mypage_required_value_checking", { fallbackKo: "확인 중…", fallbackEn: "Checking…" })
      : addressStatus === "complete"
        ? addressValueText ||
          safeT("mypage_required_status_address_done", {
            fallbackKo: "등록 완료",
            fallbackEn: "Registered",
          })
        : safeT("mypage_required_address_active_hint", {
            fallbackKo: "대표 주소를 등록해 주세요.",
            fallbackEn: "Please add your default address.",
          });

  const rows: RequiredInfoRow[] = [
    {
      id: "dibay-id",
      icon: "user-round",
      title: safeT("mypage_required_dibay_id", { fallbackKo: "아이디", fallbackEn: "ID" }),
      status: dibayStatus,
      badge: dibayIdBadge,
      value: dibayIdValue,
      ctaLabel:
        dibayStatus === "required"
          ? safeT("mypage_required_dibay_id_recover_btn", { fallbackKo: "복구", fallbackEn: "Recover" })
          : undefined,
      onCtaClick: dibayStatus === "required" ? () => openSheet("dibay-id") : undefined,
      changeLabel:
        dibayStatus === "complete" && publicIdView?.canChangeOnce
          ? safeT("mypage_required_dibay_id_change_once_action", {
              fallbackKo: "1회 변경",
              fallbackEn: "Change once",
            })
          : undefined,
      onChangeClick:
        dibayStatus === "complete" && publicIdView?.canChangeOnce
          ? () => openSheet("dibay-id")
          : undefined,
    },
    {
      id: "phone",
      icon: "phone",
      title: safeT("mypage_required_phone", { fallbackKo: "전화번호", fallbackEn: "Phone" }),
      status: phoneStatus,
      badge:
        phoneStatus === "unknown"
          ? checkingLabel
          : phoneStatus === "complete"
            ? safeT("mypage_required_status_phone_done", {
                fallbackKo: "인증 완료",
                fallbackEn: "Verified",
              })
            : safeT("mypage_required_status_phone_needed", {
                fallbackKo: "인증 필요",
                fallbackEn: "Verification needed",
              }),
      value: phoneValue,
      ctaLabel:
        phoneStatus === "required"
          ? safeT("mypage_required_cta_verify", { fallbackKo: "인증", fallbackEn: "Verify" })
          : undefined,
      onCtaClick: phoneStatus === "required" ? () => openSheet("phone") : undefined,
    },
    {
      id: "address",
      icon: "address-pin",
      title: safeT("mypage_required_address", { fallbackKo: "기본 주소", fallbackEn: "Default address" }),
      status: addressStatus,
      badge:
        addressStatus === "unknown"
          ? checkingLabel
          : addressStatus === "complete"
            ? safeT("mypage_required_status_address_done", {
                fallbackKo: "등록 완료",
                fallbackEn: "Registered",
              })
            : safeT("mypage_required_status_address_needed", {
                fallbackKo: "등록 필요",
                fallbackEn: "Address needed",
              }),
      value: addressValue,
      ctaLabel:
        addressStatus === "required"
          ? safeT("mypage_required_cta_register", { fallbackKo: "등록", fallbackEn: "Register" })
          : undefined,
      onCtaClick: addressStatus === "required" ? () => openSheet("address") : undefined,
      changeLabel:
        addressStatus === "complete"
          ? safeT("mypage_required_change_action", { fallbackKo: "변경", fallbackEn: "Change" })
          : undefined,
      onChangeClick: addressStatus === "complete" ? () => openSheet("address") : undefined,
    },
  ];

  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
      data-testid="mypage-required-info-card"
      data-state={bundleComplete ? "complete" : knownCount < 3 ? "checking" : "incomplete"}
    >
      {bundleComplete ? (
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
      ) : (
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-2.5`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
              {safeT("mypage_required_section_title", {
                fallbackKo: "필수 정보",
                fallbackEn: "Required info",
              })}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                completeCount < knownCount || knownCount < 3
                  ? "bg-[#F2F0EB] text-[#6F4E37]"
                  : "bg-[#FDECEC] text-[#C62828]"
              }`}
            >
              {completeCount}/3
            </span>
          </div>
          <p className="text-[13px] leading-snug text-[#6F4E37]">
            {knownCount < 3
              ? safeT("mypage_required_checking_desc", {
                  fallbackKo: "필수 정보 상태를 확인하고 있습니다.",
                  fallbackEn: "Checking required info status.",
                })
              : safeT("mypage_required_incomplete_desc", {
                  fallbackKo: "서비스 이용을 위해 아래 항목을 완료해 주세요.",
                  fallbackEn: "Complete the required items below to continue using the service.",
                })}
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
