"use client";

import { Suspense } from "react";
import { MemberSupportHistoryClient } from "@/components/support/MemberSupportHistoryClient";
import { MyRouteSkeleton } from "@/components/mypage/ds/MyStateView";

/** 상담 내역 (최종 설계 S63) — fallback = 행 스켈레톤 5행 */
export default function MypageSupportHistoryPage() {
  return (
    <Suspense fallback={<MyRouteSkeleton template="list" rows={5} />}>
      <MemberSupportHistoryClient />
    </Suspense>
  );
}
