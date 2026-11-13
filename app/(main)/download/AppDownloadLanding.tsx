"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/brand/app-display-name";
import {
  DIBAY_APP_ICON_512_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  DIBAY_ANDROID_PLAY_STORE_PUBLIC,
  DIBAY_ANDROID_PLAY_STORE_URL,
  DIBAY_IOS_APP_STORE_URL,
} from "@/lib/share/app-store-links";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 앱 공유 착지 화면 본문 (Owner G-1 2026-11-14 · 시안 4절).
 * - 앱 안(WebView)에서 열리면 설치 버튼 대신 「지금 앱에서 보고 있어요」 + 홈.
 * - 웹: App Store 버튼(iOS 스토어 ID 사용 가능 — G-13), Google Play 는 공개 확인 전 숨김(G-13).
 * - 설치 후 이 화면으로 자동 복귀하지 않는다(G-14) — 설치 안내만.
 */
export function AppDownloadLanding() {
  const { t } = useI18n();
  const [inApp, setInApp] = useState(false);
  /** 표시용 기기 종류만 — 설치 여부 판별 아님 (Android 에 App Store 버튼을 보이지 않기 위해) */
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setInApp(isCapacitorNativePlatform());
    setIsAndroid(/android/i.test(navigator.userAgent));
  }, []);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center px-4 pb-10 pt-12 text-center">
      <Image
        src={dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}
        alt=""
        width={88}
        height={88}
        unoptimized
        className="rounded-[20px]"
        priority
      />
      <h1 className="mt-4 text-[22px] font-bold text-sam-fg">
        {APP_PRODUCT_DISPLAY_NAME}
      </h1>
      <p className="mt-2 sam-text-body text-sam-muted">{t("share_app_desc")}</p>

      <div className="mt-8 grid w-full gap-2.5">
        {inApp ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {t("share_app_in_app")}
          </p>
        ) : (
          <>
            {!isAndroid ? (
              <a
                href={DIBAY_IOS_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${Sam.btn.primaryCombo} ${Sam.btn.block}`}
                data-dibay-app-store="ios"
              >
                {t("share_app_cta_install")} · {t("share_app_cta_app_store")}
              </a>
            ) : null}
            {DIBAY_ANDROID_PLAY_STORE_PUBLIC ? (
              <a
                href={DIBAY_ANDROID_PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${Sam.btn.primaryCombo} ${Sam.btn.block}`}
                data-dibay-app-store="android"
              >
                {t("share_app_cta_install")} · Google Play
              </a>
            ) : null}
          </>
        )}
        <Link href="/" className={`${Sam.btn.secondaryCombo} ${Sam.btn.block}`}>
          {inApp ? t("app_error_go_home") : t("share_app_cta_web")}
        </Link>
      </div>
    </div>
  );
}
