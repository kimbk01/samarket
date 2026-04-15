import { MainAppProviders } from "@/components/layout/MainAppProviders";

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getClaims/getUser·세션 갱신·Set-Cookie).
 * Provider·클라이언트 셸은 `MainAppProviders` 에 모아 두고, 여기서는 서버 레이아웃만 유지한다.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainAppProviders>{children}</MainAppProviders>;
}
