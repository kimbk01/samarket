import { isAdminUser } from "@/lib/auth/admin-policy";

/**
 * 주제가 0개일 때 「피드 주제 관리」 링크 표시 — 권한 있는 관리자(서버가 준 privilegedAdmin)에게만 (Owner 확정 2026-11-01).
 * 회원은 오류 띠 안내만 본다. 링크는 화면 표시일 뿐이고 관리 화면은 서버가 다시 권한을 확인한다.
 */
export function shouldShowNoTopicsAdminLink(
  noTopics: boolean,
  viewer: Parameters<typeof isAdminUser>[0] | undefined
): boolean {
  return noTopics && isAdminUser(viewer ?? null);
}
