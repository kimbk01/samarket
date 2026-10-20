"use client";

import { Suspense } from "react";
import { MemberSupportHistoryClient } from "@/components/support/MemberSupportHistoryClient";
import { MyStateSkeleton } from "@/components/mypage/ds/MyStateView";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/** 상담 내역 (최종 설계 S63) — fallback = 행 스켈레톤 5행 */
export default function MypageSupportHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} pt-16`}>
          <MyStateSkeleton template="list" rows={5} />
        </div>
      }
    >
      <MemberSupportHistoryClient />
    </Suspense>
  );
}
