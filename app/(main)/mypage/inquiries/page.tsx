"use client";

import { Suspense } from "react";
import { MemberCsNoteListClient } from "@/components/mypage/cs/MemberCsNoteListClient";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

export default function MypageInquiriesPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MemberCsNoteListClient kind="inquiry" />
    </Suspense>
  );
}
