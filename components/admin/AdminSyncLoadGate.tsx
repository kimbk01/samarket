"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import type { AdminSyncLoadState } from "@/components/admin/useAdminSyncLoad";

/** 로딩 → AdminLoadingState · 실패 → AdminErrorState(403 은 접근 거부) + [새로고침] · 준비 → children. */
export function AdminSyncLoadGate({
  state,
  onRetry,
  children,
}: {
  state: AdminSyncLoadState;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const { language } = useI18n();
  const ko = language !== "en";
  if (state.status === "loading") return <AdminLoadingState ko={ko} />;
  if (state.status === "error") {
    return <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={onRetry} />;
  }
  return <>{children}</>;
}
