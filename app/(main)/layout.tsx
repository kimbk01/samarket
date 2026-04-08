import { SessionLostRedirect } from "@/components/auth/SessionLostRedirect";
import { ConditionalAppShell } from "@/components/layout/ConditionalAppShell";
import { AppStickyHeader } from "@/components/layout/AppStickyHeader";
import { AppTitle } from "@/components/layout/AppTitle";
import { MainTier1ChromeProvider } from "@/components/layout/MainTier1ChromeProvider";
import { CategoryListHeaderProvider } from "@/contexts/CategoryListHeaderContext";
import { FavoriteProvider } from "@/contexts/FavoriteContext";
import { RegionProvider } from "@/contexts/RegionContext";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";
import { WriteCategoryProvider } from "@/contexts/WriteCategoryContext";

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getUser·세션 갱신·Set-Cookie).
 * 여기서 다시 getUser() 하면, 같은 요청에서 프록시가 방금 갱신한 쿠키가
 * 아직 Cookie 요청 헤더에 없어 로그인 직후 /login 으로 튕기는 문제가 난다.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RegionProvider>
      <SessionLostRedirect />
      <FavoriteProvider>
        <WriteCategoryProvider>
          <CategoryListHeaderProvider>
            <StoreCommerceCartProvider>
              <MainTier1ChromeProvider>
                <AppTitle />
                {/* 메인 1단·헤더 스택 단일 삽입 — `lib/layout/main-tier1.ts` */}
                <AppStickyHeader />
                <ConditionalAppShell regionBarInLayout={true}>{children}</ConditionalAppShell>
              </MainTier1ChromeProvider>
            </StoreCommerceCartProvider>
          </CategoryListHeaderProvider>
        </WriteCategoryProvider>
      </FavoriteProvider>
    </RegionProvider>
  );
}
