"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { Sam } from "@/lib/ui/sam-component-classes";
import { FRIEND_QR_ANDROID_STORE_URL } from "@/lib/community-messenger/friend-qr/friend-qr-contract";

/** [앱에서 열기] 뒤 이 시간 안에 앱으로 넘어가지 않으면(페이지가 계속 보이면) 앱이 없거나 구 빌드로 본다 */
const OPEN_APP_FALLBACK_MS = 1500;

/**
 * 친구 QR 웹 페이지 본문 (시안 I · QR 친구 재감사 Q6) — 아이디는 보여 주지 않는다(사진·이름만).
 * - 앱 안 화면(WebView)에서 열리면 이 화면을 건너뛰고 바로 메신저 결과 시트로 간다.
 * - [앱에서 열기]: `dibay://friend/…`. 1.5초 안에 앱이 안 열리면 Android 는 Play 스토어로.
 *   iOS 는 App Store 주소가 정해지기 전이라(Owner 결정 대기) 이동하지 않는다 — [웹에서 계속]으로 계속할 수 있다.
 */
export function FriendQrWebLanding({
  owner,
  appLink,
  continueHref,
}: {
  owner: { displayName: string; avatarUrl: string | null } | null;
  appLink: string | null;
  continueHref: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [inApp, setInApp] = useState(false);
  const fallbackTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (cancelled || !Capacitor.isNativePlatform()) return;
        setInApp(true);
        router.replace(continueHref);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [continueHref, router]);

  useEffect(() => {
    const clear = () => {
      if (fallbackTimer.current != null) window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") clear();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", clear);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", clear);
    };
  }, []);

  const openApp = useCallback(() => {
    if (!appLink) return;
    if (fallbackTimer.current != null) window.clearTimeout(fallbackTimer.current);
    if (/android/i.test(navigator.userAgent)) {
      fallbackTimer.current = window.setTimeout(() => {
        fallbackTimer.current = null;
        if (document.visibilityState === "visible") window.location.href = FRIEND_QR_ANDROID_STORE_URL;
      }, OPEN_APP_FALLBACK_MS);
    }
    window.location.href = appLink;
  }, [appLink]);

  if (inApp) return null;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      {owner ? (
        <>
          <SamarketUserAvatar avatarUrl={owner.avatarUrl} sizePx={88} alt="" />
          <div className="max-w-full">
            <p className="text-[20px] font-bold leading-[1.35] text-sam-fg [overflow-wrap:anywhere] [text-wrap:balance]">
              {owner.displayName || t("friend_qr_member_fallback")}
            </p>
            <p className="mt-1 text-[14px] text-sam-muted">{t("friend_qr_web_invite")}</p>
          </div>
          {appLink ? (
            <button
              type="button"
              onClick={openApp}
              className={`${Sam.btn.primary} w-full justify-center whitespace-nowrap`}
              data-testid="friend-qr-web-open-app"
            >
              {t("friend_qr_web_open_app")}
            </button>
          ) : null}
          <Link href={continueHref} className={`${Sam.btn.secondary} w-full justify-center whitespace-nowrap`} data-testid="friend-qr-web-continue">
            {t("friend_qr_web_continue")}
          </Link>
        </>
      ) : (
        <p className="text-[15px] text-sam-muted" role="alert">
          {t("friend_qr_err_unusable")}
        </p>
      )}
    </main>
  );
}
