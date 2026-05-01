"use client";

/**
 * 디바이 앱 세션 종료 (카카오·배민·당근형 모바일 정책)
 *
 * - 사용자가 **확정한 로그아웃**(설정의 확인 모달 또는 세션 교체 확인)에서만 호출한다.
 * - Google/Kakao/Naver 등 SNS 제공자 계정 로그아웃은 하지 않는다 (`signOut({ scope: "local" })`).
 * - Web Push 구독은 여기서만 서버·브라우저에서 해제한다 (앱 종료만으로는 호출하지 않음).
 *
 * @see `performClientLogout` — 내부 구현; 새 코드는 이 모듈만 import 할 것.
 */

import { disconnectWebPushSubscriptionsForLogout } from "@/lib/push/disconnect-web-push-for-logout-client";
import { performClientLogout, type LogoutResult } from "@/lib/auth/logout-client";

export type { LogoutResult } from "@/lib/auth/logout-client";

export async function logoutDiBaYAppSession(): Promise<LogoutResult> {
  await disconnectWebPushSubscriptionsForLogout();
  return performClientLogout();
}
