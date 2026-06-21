"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import { shouldShowProfileCompletionNudge } from "@/lib/profile/profile-completion-state";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type RowDef = {
  id: "dibay-id" | "phone" | "address";
  labelKey: "mypage_required_dibay_id" | "mypage_required_phone" | "mypage_required_address";
  complete: boolean;
  incompletePillKey: "mypage_status_needed" | "mypage_status_verify_needed" | "mypage_status_register_needed";
  completePillKey: "mypage_status_done" | "mypage_status_phone_done";
  onPress: () => void;
};

function StatusPill({
  complete,
  incompleteLabel,
  completeLabel,
}: {
  complete: boolean;
  incompleteLabel: string;
  completeLabel: string;
}) {
  if (complete) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E8F3EE] px-2 py-0.5 text-[11px] font-medium text-[#00704A]">
        <span className="text-[8px] leading-none" aria-hidden>
          ●
        </span>
        {completeLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      <span className="text-[8px] leading-none text-red-600" aria-hidden>
        ●
      </span>
      {incompleteLabel}
    </span>
  );
}

export function RequiredInfoList({
  completion,
  onDibayIdPress,
  onPhonePress,
  onAddressPress,
}: {
  completion: ProfileCompletionState;
  onDibayIdPress: () => void;
  onPhonePress: () => void;
  onAddressPress: () => void;
}) {
  const { safeT } = useI18n();

  const rows: RowDef[] = [
    {
      id: "dibay-id",
      labelKey: "mypage_required_dibay_id",
      complete: completion.hasDibayId,
      incompletePillKey: "mypage_status_needed",
      completePillKey: "mypage_status_done",
      onPress: onDibayIdPress,
    },
    {
      id: "phone",
      labelKey: "mypage_required_phone",
      complete: completion.hasVerifiedPhone,
      incompletePillKey: "mypage_status_verify_needed",
      completePillKey: "mypage_status_phone_done",
      onPress: onPhonePress,
    },
    {
      id: "address",
      labelKey: "mypage_required_address",
      complete: completion.hasDefaultAddress,
      incompletePillKey: "mypage_status_register_needed",
      completePillKey: "mypage_status_done",
      onPress: onAddressPress,
    },
  ];

  const visibleRows = rows.filter((row) => !row.complete);
  if (visibleRows.length === 0) return null;

  const showNudge = shouldShowProfileCompletionNudge(completion);

  return (
    <section className={MYPAGE_HOME_CARD_CLASS}>
      <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
          {safeT("mypage_required_section_title", {
            fallbackKo: "필수 정보",
            fallbackEn: "Required info",
          })}
        </h2>
      </div>
      <ul className="divide-y divide-[#D4E9E2]/80">
        {visibleRows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={row.onPress}
              className="flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left active:bg-[#F7FAF8] sm:px-5"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#1E3932]">
                {safeT(row.labelKey, {
                  fallbackKo:
                    row.id === "dibay-id"
                      ? "@아이디"
                      : row.id === "phone"
                        ? "전화번호"
                        : "기본 주소",
                  fallbackEn:
                    row.id === "dibay-id" ? "@ ID" : row.id === "phone" ? "Phone" : "Default address",
                })}
              </span>
              <StatusPill
                complete={row.complete}
                incompleteLabel={safeT(row.incompletePillKey, {
                  fallbackKo:
                    row.incompletePillKey === "mypage_status_needed"
                      ? "필요"
                      : row.incompletePillKey === "mypage_status_verify_needed"
                        ? "인증필요"
                        : "등록필요",
                  fallbackEn:
                    row.incompletePillKey === "mypage_status_needed"
                      ? "Required"
                      : row.incompletePillKey === "mypage_status_verify_needed"
                        ? "Verify"
                        : "Register",
                })}
                completeLabel={safeT(row.completePillKey, {
                  fallbackKo: row.completePillKey === "mypage_status_phone_done" ? "인증완료" : "등록완료",
                  fallbackEn: row.completePillKey === "mypage_status_phone_done" ? "Verified" : "Done",
                })}
              />
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6F4E37]/60" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {showNudge ? (
        <p className="border-t border-[#D4E9E2]/80 px-4 py-2.5 text-[12px] leading-relaxed text-[#6F4E37] sm:px-5">
          {safeT("mypage_required_nudge", {
            fallbackKo: "필수 정보를 완료하면 거래·배달·채팅 이용이 더 원활해집니다.",
            fallbackEn: "Complete required info for smoother trade, delivery, and chat.",
          })}
        </p>
      ) : null}
    </section>
  );
}
