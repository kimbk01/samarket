"use client";

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { SupportCasesHistoryList } from "@/components/support/SupportCasesHistoryList";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { resolveCustomerCenterBackHref } from "@/lib/mypage/customer-center-paths";
import { DISABLED_SUPPORT_CONTEXT } from "@/lib/support/support-context";

/**
 * 고객 상담 내역 `/mypage/support-history` (최종 설계 S63) — 상태 탭 `?tab=active|done` + 더 보기.
 * 뒤로 = 고객센터 허브(`?from=customer-center`).
 */
export function MemberSupportHistoryClient() {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const from = sp.get("from");
  const backHref = resolveCustomerCenterBackHref(from, "/mypage/customer-center");

  return (
    <SupportContextProvider value={DISABLED_SUPPORT_CONTEXT}>
      <MyScreen
        title={safeT("support_history_title", {
          fallbackKo: "상담 내역",
          fallbackEn: "Support history",
        })}
        backHref={backHref}
        preferHistoryBack={false}
        template="list"
      >
        <SupportCasesHistoryList audience="MEMBER" withStatusTabs />
      </MyScreen>
    </SupportContextProvider>
  );
}
