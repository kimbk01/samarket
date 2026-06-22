"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import {
  MYPAGE_ADDRESSES_HREF,
  MYPAGE_REQUIRED_DIBAY_ID_HREF,
  MYPAGE_REQUIRED_PHONE_HREF,
} from "@/lib/mypage/mypage-profile-routes";

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
      <span className="inline-flex max-w-[40%] shrink-0 items-center truncate rounded-full bg-sam-app px-2 py-0.5 text-[11px] font-medium text-sam-muted">
        {completeLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-[40%] shrink-0 items-center truncate rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      {incompleteLabel}
    </span>
  );
}

const ROW_CLASS =
  "flex h-[56px] min-w-0 items-center gap-2 border-b border-sam-border/80 px-4 last:border-b-0 active:bg-sam-app sm:px-5";

export function RequiredInfoList({ completion }: { completion: ProfileCompletionState }) {
  const { safeT } = useI18n();

  const rows = [
    {
      href: MYPAGE_REQUIRED_DIBAY_ID_HREF,
      labelKey: "mypage_required_dibay_id" as const,
      fallbackKo: "@아이디",
      fallbackEn: "@ ID",
      complete: completion.hasDibayId,
      incompletePillKey: "mypage_status_needed" as const,
      incompleteKo: "필요",
      incompleteEn: "Required",
      completePillKey: "mypage_status_done" as const,
      completeKo: "완료",
      completeEn: "Done",
    },
    {
      href: MYPAGE_REQUIRED_PHONE_HREF,
      labelKey: "mypage_required_phone" as const,
      fallbackKo: "전화번호 인증",
      fallbackEn: "Phone verification",
      complete: completion.hasVerifiedPhone,
      incompletePillKey: "mypage_status_verify_needed" as const,
      incompleteKo: "인증필요",
      incompleteEn: "Verify",
      completePillKey: "mypage_status_phone_done" as const,
      completeKo: "인증완료",
      completeEn: "Verified",
    },
    {
      href: MYPAGE_ADDRESSES_HREF,
      labelKey: "mypage_required_address" as const,
      fallbackKo: "기본 주소",
      fallbackEn: "Default address",
      complete: completion.hasDefaultAddress,
      incompletePillKey: "mypage_status_register_needed" as const,
      incompleteKo: "등록필요",
      incompleteEn: "Register",
      completePillKey: "mypage_status_done" as const,
      completeKo: "등록완료",
      completeEn: "Done",
    },
  ];

  return (
    <section className="mt-1 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
      <div className="border-b border-sam-border/80 px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-semibold text-sam-fg">
          {safeT("mypage_required_section_title", {
            fallbackKo: "필수 정보",
            fallbackEn: "Required info",
          })}
        </h2>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.href}>
            <Link href={row.href} className={ROW_CLASS}>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-sam-fg">
                {safeT(row.labelKey, {
                  fallbackKo: row.fallbackKo,
                  fallbackEn: row.fallbackEn,
                })}
              </span>
              <StatusPill
                complete={row.complete}
                incompleteLabel={safeT(row.incompletePillKey, {
                  fallbackKo: row.incompleteKo,
                  fallbackEn: row.incompleteEn,
                })}
                completeLabel={safeT(row.completePillKey, {
                  fallbackKo: row.completeKo,
                  fallbackEn: row.completeEn,
                })}
              />
              <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
