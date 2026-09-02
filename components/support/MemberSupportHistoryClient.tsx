"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { SupportCasesHistoryList } from "@/components/support/SupportCasesHistoryList";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCustomerCenterBackHref } from "@/lib/mypage/customer-center-paths";
import { useSearchParams } from "next/navigation";
import {
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { CC_PAGE_WHITE_CLASS } from "@/lib/mypage/customer-center-ui";

export function MemberSupportHistoryClient() {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const from = sp.get("from");
  const backHref = resolveCustomerCenterBackHref(from, "/mypage/customer-center");

  return (
    <div className={`flex min-h-screen flex-col ${CC_PAGE_WHITE_CLASS}`}>
      <MySubpageHeader
        title={safeT("support_history_title", {
          fallbackKo: "상담 내역",
          fallbackEn: "Support history",
        })}
        backHref={backHref}
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={CUSTOMER_CENTER_LIST_COLUMN_CLASS}>
          <SupportCasesHistoryList audience="MEMBER" />
        </div>
      </div>
    </div>
  );
}
