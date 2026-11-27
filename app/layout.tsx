import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { AppBootProvider } from "@/components/app/AppBootProvider";
import { InitialSurfaceBootstrap } from "@/components/app/InitialSurfaceBootstrap";
import { LifecycleRouteEffects } from "@/lib/lifecycle/lifecycle-route-effects.client";
import { LaunchIntroRoot } from "@/components/launch-intro/LaunchIntroRoot";
import { OAuthReturnListener } from "@/components/auth/OAuthReturnListener";
import { WindowsShellOAuthReturnListener } from "@/components/auth/WindowsShellOAuthReturnListener";
import { CapacitorNativeMarkerBootstrap } from "@/components/platform/CapacitorNativeMarkerBootstrap";
import { NativeSystemBarsLightBootstrap } from "@/components/platform/NativeSystemBarsLightBootstrap";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
/**
 * 로그아웃 표시 해제 부품은 루트 1곳(가입 단계·로그인·관리자 포함) — 서버 콜백 로그인이 가입 단계 화면에서 부팅을 끝내도
 * 표시를 지워 로그인 사용자 값이 막히지 않게. SupabaseAuthSync 보다 먼저 붙인다 (signup-mypage-skeleton-fix-design-2026-11-27).
 */
import { PostLogoutBfcacheGuard } from "@/components/auth/PostLogoutBfcacheGuard";
import { AppLanguageProvider } from "@/components/i18n/AppLanguageProvider";
import {
  DibayAppDialogImperativeBridge,
  DibayAppDialogProvider,
} from "@/components/ui/dibay-overlay";
import { AppTitle } from "@/components/layout/AppTitle";
import { KeyboardViewportRootProbe } from "@/components/layout/KeyboardViewportRootProbe";
import { CallIncomingChromeRoot } from "@/components/layout/providers/CallIncomingChromeRoot";
import { DeferredMainShellMessengerParticipantBridge } from "@/components/layout/DeferredMainShellMessengerParticipantBridge";
import { NotificationSoundLeaderBootstrap } from "@/components/notifications/NotificationSoundLeaderBootstrap";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/brand/app-display-name";
import {
  DIBAY_APP_ICON_180_PATH,
  DIBAY_APP_ICON_512_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";
import { APP_LANGUAGE_COOKIE, type AppLanguageCode } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { RequiredConsentVersionsBootstrap } from "@/components/legal/RequiredConsentVersionsBootstrap";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { requiredConsentForClient } from "@/lib/legal/client-required-consent";
import { DIBAY_HOST_SHELL_BOOT_SCRIPT } from "@/lib/platform/dibay-windows-shell";
import { buildPreHydrationGuardScript } from "@/lib/startup/pre-hydration-guard-script";
import { POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT } from "@/lib/navigation/popstate-before-router";
import { resolveShareSiteOrigin } from "@/lib/share/share-url";
import "./globals.css";

/** C2 — hydration 전 청크 실패 초기 가드 (빌드 SHA 고정 문자열, 요청마다 같은 값). */
const PRE_HYDRATION_GUARD_SCRIPT = buildPreHydrationGuardScript(process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA);

export const metadata: Metadata = {
  title: APP_PRODUCT_DISPLAY_NAME,
  description: `${APP_PRODUCT_DISPLAY_NAME} marketplace`,
  applicationName: APP_PRODUCT_DISPLAY_NAME,
  icons: {
    /**
     * 감사 2026-11-26 D4: `/favicon.ico` 는 파일 규칙(`app/favicon.ico`)이 이미 `<link rel="icon">` 을 낸다.
     * 여기서 같은 주소(쿼리만 다름)를 또 선언하면 같은 파일을 이동마다 두 번 받는다(실측: 이동 1회에 아이콘 요청 18~28회).
     */
    icon: [
      {
        url: dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH),
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: [
      {
        url: dibayBrandAssetUrl(DIBAY_APP_ICON_180_PATH),
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: APP_PRODUCT_DISPLAY_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  /**
   * 링크 미리보기 기본값(통합 공유 S4) — 자체 미리보기가 없는 화면을 공유해도 앱 이름·대표 이미지만 보인다.
   * 이미지는 운영 주소 절대값(전역 metadataBase 는 두지 않음 — 아이콘 등 다른 주소에 영향 주지 않기 위해).
   */
  openGraph: {
    type: "website",
    siteName: APP_PRODUCT_DISPLAY_NAME,
    title: APP_PRODUCT_DISPLAY_NAME,
    description: `${APP_PRODUCT_DISPLAY_NAME} marketplace`,
    images: [
      {
        url: `${resolveShareSiteOrigin()}${dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}`,
        width: 512,
        height: 512,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: APP_PRODUCT_DISPLAY_NAME,
    description: `${APP_PRODUCT_DISPLAY_NAME} marketplace`,
    images: [`${resolveShareSiteOrigin()}${dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}`],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

/** 모바일·태블릿 웹뷰/PWA 대비 — 반응형 레이아웃·노치 영역 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /** Android Chrome 등: 가상 키보드 시 레이아웃 뷰포트가 줄어들어 채팅 입력·flex 높이와 맞기 쉬움 */
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  /** 다크 모드 없음 — 기기 다크여도 같은 값 */
  themeColor: "#0B421A",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const langCookie = jar.get(APP_LANGUAGE_COOKIE)?.value;
  const hdr = await headers();
  const acceptLanguage = hdr.get("accept-language");
  const initialLanguage: AppLanguageCode = resolveServerInitialLanguage({
    cookieValue: langCookie ?? null,
    acceptLanguage,
  });
  // B11: client consent gates judge against the same CMS versions the server enforces.
  const requiredConsent = await resolveRequiredConsentVersions()
    .then(requiredConsentForClient)
    .catch(() => null);

  return (
    <html lang={initialLanguage} suppressHydrationWarning>
      <head>
        {/* B-11: Windows 앱이면 화면을 그리기 전에 표시 — 로그인 첫 화면 일반 버튼→QR 깜빡임 방지 (웹 브라우저·폰 앱은 무동작) */}
        <script dangerouslySetInnerHTML={{ __html: DIBAY_HOST_SHELL_BOOT_SCRIPT }} />
        {/* C2: 앱 번들·초기 청크 실패 시 OS 시작 화면에 갇히지 않게 — 빌드당 새로고침 1회, 이후 오류 안내+해제 */}
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_GUARD_SCRIPT }} />
        {/* 뒤로(popstate)를 Next 라우터보다 먼저 받는 단일 리스너 — 화면 리스너 등록 순서 문제 제거 (`lib/navigation/popstate-before-router.ts`) */}
        <script dangerouslySetInnerHTML={{ __html: POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {/* Launch Intro (native, cached publication only): LaunchIntroRoot defers the route tree
            while the Intro owns the launch (DEFERRED MOUNT). Web / no launch epoch → HOME as before. */}
        <RequiredConsentVersionsBootstrap versions={requiredConsent} />
        <AppLanguageProvider initialLanguage={initialLanguage}>
          <DibayAppDialogProvider>
            <DibayAppDialogImperativeBridge />
            <AppBootProvider>
            <AppTitle />
            <KeyboardViewportRootProbe />
            <PostLogoutBfcacheGuard />
            <SupabaseAuthSync />
            <CapacitorNativeMarkerBootstrap />
            <NativeSystemBarsLightBootstrap />
            <OAuthReturnListener />
            <WindowsShellOAuthReturnListener />
            <CallIncomingChromeRoot />
            <NotificationSoundLeaderBootstrap />
            <DeferredMainShellMessengerParticipantBridge regionBarInLayout={true} />
            {/* 앱 진입 v3 ①: 생명주기 이동(복원·안전 진입·첫 진입 화면)은 인트로가 화면을 덮는 동안에도 먼저 일어나야
                인트로가 끝난 뒤 홈이 한 번 보이지 않는다 — 인트로 보류 밖에 둔다 */}
            <LifecycleRouteEffects />
            <InitialSurfaceBootstrap />
            <LaunchIntroRoot>{children}</LaunchIntroRoot>
          </AppBootProvider>
          </DibayAppDialogProvider>
        </AppLanguageProvider>
      </body>
    </html>
  );
}
