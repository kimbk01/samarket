import { Suspense } from "react";
import { AppUpdateHistoryClient } from "@/components/app-updates/AppUpdateHistoryClient";

/** 업데이트 내역 — 스토어 출시 기록 자동 목록 · 업데이트 안내 알림 목적지 (앱 업데이트 v2). */
export default function AppUpdatesPage() {
  return (
    <Suspense fallback={null}>
      <AppUpdateHistoryClient />
    </Suspense>
  );
}
