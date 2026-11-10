"use client";

/** D 단계: 어드민 화면은 어드민 전용 문구 묶음을 등록한다 (회원 화면 묶음에는 없음 — `lib/i18n/admin-catalog.ts`). */
import "@/lib/i18n/admin-catalog";

/**
 * Platform Admin layout entry — Shell v2.
 * Owner Admin (`BusinessAdminShell`) must not import this module.
 */
export { AdminPlatformShell as AdminShell } from "@/components/admin/shell/AdminPlatformShell";
