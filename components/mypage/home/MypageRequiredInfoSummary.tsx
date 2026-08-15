"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { deriveMemberAccountStatus } from "@/lib/profile/member-account-status";
import { useRepresentativeFullAddressLine } from "@/hooks/use-representative-address-line";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type RowTone = "neutral" | "action";

function ControlRow({
  title,
  badge,
  value,
  hint,
  ctaLabel,
  onActivate,
  tone,
  testId,
}: {
  title: string;
  badge: string;
  value: string;
  hint: string;
  ctaLabel?: string;
  onActivate?: () => void;
  tone: RowTone;
  testId: string;
}) {
  const clickable = Boolean(onActivate);
  const isAddress = testId.includes("address");
  return (
    <li
      className={`rounded-ui-rect border ${
        tone === "action"
          ? "border-[#E53935]/45 bg-[#FFF5F5] shadow-[inset_3px_0_0_0_#E53935]"
          : "border-[#D4E9E2] bg-white"
      } ${clickable ? "cursor-pointer active:opacity-90" : ""}`}
      data-testid={testId}
      onClick={clickable ? onActivate : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate?.();
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={`mt-0.5 ${isAddress || tone !== "action" ? "text-[#00704A]" : "text-[#C62828]"}`}>
          {isAddress ? (
            <AddressKindHeadPin kind="master" className="[&_svg]:h-5 [&_svg]:w-[1rem]" />
          ) : tone === "action" ? (
            <span className="block h-5 w-5" aria-hidden />
          ) : (
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[15px] font-semibold ${tone === "action" ? "text-[#B71C1C]" : "text-[#1E3932]"}`}>
              {title}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                tone === "action" ? "bg-[#FDECEC] text-[#C62828]" : "bg-[#E8F3EE] text-[#00704A]"
              }`}
            >
              {badge}
            </span>
          </div>
          <p className={`mt-1 truncate text-[13px] leading-snug ${tone === "action" ? "text-[#C62828]" : "text-[#6F4E37]"}`}>
            {value}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-[#6F4E37]">{hint}</p>
        </div>
        {ctaLabel ? (
          <span className="shrink-0 text-[13px] font-semibold text-[#00704A] underline underline-offset-2">
            {ctaLabel}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * 계정·인증 컨트롤 센터 — @아이디 / 전화 / 주소 3행을 항상 표시.
 * 3/3 합산·필수완료 위저드 금지. 주소 줄은 event-driven 대표주소 hook만 사용.
 */
export function MypageRequiredInfoSummary({
  projection,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const { openSheet } = useMypageProfileSheets();
  const profile = projection?.profile ?? null;
  const representativeAddressLine = useRepresentativeFullAddressLine();
  const hookAddressLine =
    representativeAddressLine.status === "ready" ? representativeAddressLine.line?.trim() ?? "" : "";
  const addressRegistered = projection?.addressStatus === "complete" || Boolean(hookAddressLine);

  const status = useMemo(
    () => deriveMemberAccountStatus(profile, { hasDefaultAddress: addressRegistered }),
    [addressRegistered, profile],
  );

  const addressLine = hookAddressLine;

  if (!projection || projection.phoneStatus === "unknown" || projection.addressStatus === "unknown" || !profile) {
    return (
      <section
        className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
        data-testid="mypage-account-control-card"
        data-state="checking"
      >
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-2.5`}>
          <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
            {safeT("mypage_account_control_title", {
              fallbackKo: "계정 및 인증 정보",
              fallbackEn: "Account & verification",
            })}
          </h2>
          <p className="text-[13px] leading-snug text-[#6F4E37]">
            {safeT("mypage_account_control_checking_desc", {
              fallbackKo: "계정 정보를 확인하고 있습니다.",
              fallbackEn: "Checking account info.",
            })}
          </p>
        </div>
      </section>
    );
  }

  const handleValue = status.handle.atDisplay || status.handle.value || "—";
  const handleCanChange = status.handle.canChange;
  const handleMissing = !status.handle.atDisplay && !status.handle.value;

  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
      data-testid="mypage-account-control-card"
      data-state="ready"
    >
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-1.5`}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
          {safeT("mypage_account_control_title", {
            fallbackKo: "계정 및 인증 정보",
            fallbackEn: "Account & verification",
          })}
        </h2>
        <p className="text-[13px] leading-snug text-[#6F4E37]">
          {safeT("mypage_account_control_desc", {
            fallbackKo: "아이디·전화번호·기본 주소를 관리하세요.",
            fallbackEn: "Manage your ID, phone, and default address.",
          })}
        </p>
      </div>

      <ul className="space-y-2 p-3">
        <ControlRow
          testId="mypage-account-row-handle"
          title={safeT("mypage_required_dibay_id", { fallbackKo: "@아이디", fallbackEn: "@ ID" })}
          badge={
            handleMissing
              ? safeT("mypage_required_dibay_id_recover_btn", { fallbackKo: "복구", fallbackEn: "Recover" })
              : handleCanChange
                ? safeT("mypage_handle_badge_default", { fallbackKo: "기본 아이디", fallbackEn: "Default ID" })
                : safeT("mypage_handle_badge_changed", { fallbackKo: "변경 완료", fallbackEn: "Changed" })
          }
          value={handleValue}
          hint={
            handleMissing
              ? safeT("mypage_required_dibay_id_recover_hint", {
                  fallbackKo: "아이디가 없습니다. 복구가 필요합니다.",
                  fallbackEn: "No ID found. Recovery is required.",
                })
              : handleCanChange
                ? safeT("mypage_handle_hint_change_once", {
                    fallbackKo: "아이디는 1회 변경할 수 있습니다.",
                    fallbackEn: "You can change your ID once.",
                  })
                : safeT("mypage_handle_hint_changed", {
                    fallbackKo: "아이디 변경 기회를 사용했습니다.",
                    fallbackEn: "Your one-time ID change has been used.",
                  })
          }
          ctaLabel={
            handleMissing
              ? safeT("mypage_required_dibay_id_recover_btn", { fallbackKo: "복구", fallbackEn: "Recover" })
              : handleCanChange
                ? safeT("mypage_handle_cta_change", { fallbackKo: "아이디 변경", fallbackEn: "Change ID" })
                : undefined
          }
          onActivate={handleCanChange || handleMissing ? () => openSheet("dibay-id") : undefined}
          tone="neutral"
        />
        <ControlRow
          testId="mypage-account-row-phone"
          title={safeT("mypage_required_phone", { fallbackKo: "전화번호", fallbackEn: "Phone" })}
          badge={
            status.phone.verified
              ? safeT("mypage_required_status_phone_done", { fallbackKo: "인증 완료", fallbackEn: "Verified" })
              : safeT("mypage_required_status_phone_needed", { fallbackKo: "인증 필요", fallbackEn: "Verification needed" })
          }
          value={
            status.phone.value ||
            safeT("mypage_phone_none", {
              fallbackKo: "등록된 번호 없음",
              fallbackEn: "No phone on file",
            })
          }
          hint={
            status.phone.verified
              ? safeT("mypage_required_status_phone_done", { fallbackKo: "인증 완료", fallbackEn: "Verified" })
              : safeT("mypage_required_phone_active_hint", {
                  fallbackKo: "전화번호 인증이 필요합니다.",
                  fallbackEn: "Phone verification is required.",
                })
          }
          ctaLabel={
            status.phone.verified
              ? safeT("mypage_required_change_action", { fallbackKo: "변경", fallbackEn: "Change" })
              : safeT("mypage_required_cta_verify", { fallbackKo: "인증", fallbackEn: "Verify" })
          }
          onActivate={() => openSheet("phone")}
          tone={status.phone.verified ? "neutral" : "action"}
        />
        <ControlRow
          testId="mypage-account-row-address"
          title={safeT("mypage_required_address", { fallbackKo: "기본 주소", fallbackEn: "Default address" })}
          badge={
            status.address.registered
              ? safeT("mypage_required_status_address_done", { fallbackKo: "등록 완료", fallbackEn: "Registered" })
              : safeT("mypage_required_status_address_needed", {
                  fallbackKo: "주소 등록 필요",
                  fallbackEn: "Address needed",
                })
          }
          value={
            status.address.registered
              ? addressLine ||
                safeT("mypage_required_status_address_done", { fallbackKo: "등록 완료", fallbackEn: "Registered" })
              : safeT("mypage_address_none", {
                  fallbackKo: "등록된 기본주소 없음",
                  fallbackEn: "No default address",
                })
          }
          hint={
            status.address.registered
              ? safeT("mypage_required_change_action", { fallbackKo: "변경", fallbackEn: "Change" })
              : safeT("mypage_required_address_active_hint", {
                  fallbackKo: "대표 주소를 등록해 주세요.",
                  fallbackEn: "Please add your default address.",
                })
          }
          ctaLabel={
            status.address.registered
              ? safeT("mypage_required_change_action", { fallbackKo: "변경", fallbackEn: "Change" })
              : safeT("mypage_required_cta_register", { fallbackKo: "주소 등록", fallbackEn: "Add address" })
          }
          onActivate={() => router.push(buildMypageAddressesHref("/mypage"))}
          tone={status.address.registered ? "neutral" : "action"}
        />
      </ul>
    </section>
  );
}
