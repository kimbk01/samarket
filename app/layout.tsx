import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { AppBootProvider } from "@/components/app/AppBootProvider";
import { InitialSurfaceBootstrap } from "@/components/app/InitialSurfaceBootstrap";
import { LifecycleRouteEffects } from "@/lib/lifecycle/lifecycle-route-effects.client";
import { LaunchIntroRoot } from "@/components/launch-intro/LaunchIntroRoot";
import { OAuthReturnListener } from "@/components/auth/OAuthReturnListener";
import { WindowsShellOAuthReturnListener } from "@/components/auth/WindowsShellOAuthReturnListener";
import { CapacitorNativeMarkerBootstrap } from "@/components/platform/CapacitorNativeMarkerBootstrap";
import { StagingDeployMarker } from "@/components/platform/StagingDeployMarker";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
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
  DIBAY_FAVICON_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";
import { APP_LANGUAGE_COOKIE, type AppLanguageCode } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { RequiredConsentVersionsBootstrap } from "@/components/legal/RequiredConsentVersionsBootstrap";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { requiredConsentForClient } from "@/lib/legal/client-required-consent";
import { DIBAY_HOST_SHELL_BOOT_SCRIPT } from "@/lib/platform/dibay-windows-shell";
import { buildPreHydrationGuardScript } from "@/lib/startup/pre-hydration-guard-script";
import "./globals.css";

/** C2 — hydration 전 청크 실패 초기 가드 (빌드 SHA 고정 문자열, 요청마다 같은 값). */
const PRE_HYDRATION_GUARD_SCRIPT = buildPreHydrationGuardScript(process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA);

export const metadata: Metadata = {
  title: APP_PRODUCT_DISPLAY_NAME,
  description: `${APP_PRODUCT_DISPLAY_NAME} marketplace`,
  applicationName: APP_PRODUCT_DISPLAY_NAME,
  icons: {
    icon: [
      { url: dibayBrandAssetUrl(DIBAY_FAVICON_PATH), sizes: "any" },
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B421A" },
    { media: "(prefers-color-scheme: dark)", color: "#0B421A" },
  ],
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
            <SupabaseAuthSync />
            <CapacitorNativeMarkerBootstrap />
            <OAuthReturnListener />
            <WindowsShellOAuthReturnListener />
            <CallIncomingChromeRoot />
            <NotificationSoundLeaderBootstrap />
            <DeferredMainShellMessengerParticipantBridge regionBarInLayout={true} />
            <LaunchIntroRoot>
              <LifecycleRouteEffects />
              <InitialSurfaceBootstrap />
              {children}
            </LaunchIntroRoot>
          </AppBootProvider>
          </DibayAppDialogProvider>
        </AppLanguageProvider>
        {/* 스테이징(회원 미공개) 주소로 열었을 때만 주황 테두리·이름표 — 운영 주소에서는 그리지 않음 */}
        <StagingDeployMarker />
      </body>
    </html>
  );
}
