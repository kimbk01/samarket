"use client";

import {
  dismissLoginRequiredSheet,
  reopenLoginRequiredSheet,
} from "@/lib/auth/require-auth-action";

/** Custom Tab / Native SDK / Naver 등 외부 handoff 직전 — 로그인 시트 즉시 닫기 */
export function handoffOAuthLoginShell(): void {
  dismissLoginRequiredSheet();
}

/** OAuth 시작 실패(취소 제외) — 직전 로그인 시트·pending action 컨텍스트 복원 */
export function restoreOAuthLoginShellAfterFailure(): void {
  reopenLoginRequiredSheet();
}
