"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 친구 QR 웹 페이지 본문 (시안 I) — 아이디는 보여 주지 않는다(사진·이름만) */
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
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      {owner ? (
        <>
          <SamarketUserAvatar avatarUrl={owner.avatarUrl} sizePx={88} alt="" />
          <div>
            <p className="text-[20px] font-bold text-sam-fg">{owner.displayName}</p>
            <p className="mt-1 text-[14px] text-sam-muted">{t("friend_qr_web_invite")}</p>
          </div>
          {appLink ? (
            <a href={appLink} className={`${Sam.btn.primary} w-full justify-center`} data-testid="friend-qr-web-open-app">
              {t("friend_qr_web_open_app")}
            </a>
          ) : null}
          <Link href={continueHref} className={`${Sam.btn.secondary} w-full justify-center`} data-testid="friend-qr-web-continue">
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
