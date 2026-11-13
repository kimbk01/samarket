"use client";

/**
 * 초대 랜딩 — 비회원 화면 (Owner G-7 2026-11-14 · 시안 4절).
 * - 보이는 것 = 초대 종류 · 이름 · 대표 사진 · 인원 · 승인 필요 여부만.
 * - 「로그인하고 참여하기」 → 로그인 후 이 초대 주소로 돌아온다(`next`). 가입은 돌아온 뒤 기존 화면·API 가 인증·권한·승인을 검사한다.
 * - 무효(없음·만료·철회) = 「초대 링크가 만료되었어요」 + 홈으로.
 */
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { Sam } from "@/lib/ui/sam-component-classes";
import { inviteMembersKey } from "@/lib/share/invite-members-key";

export type InviteLandingGuestCardProps = {
  kind: "moim" | "group";
  preview: {
    title: string;
    imageUrl: string | null;
    memberCount: number;
    requiresApproval: boolean;
  } | null;
  loginHref: string;
};

export function InviteLandingGuestCard({ kind, preview, loginHref }: InviteLandingGuestCardProps) {
  const { t } = useI18n();

  if (!preview) {
    return (
      <div
        className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 py-10 text-center"
        data-dibay-invite-landing="expired"
      >
        <p className="text-[17px] font-bold text-sam-fg">{t("share_invite_expired_title")}</p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("share_invite_expired_body")}</p>
        <Link href="/" className={`${Sam.btn.primaryCombo} ${Sam.btn.block} mt-6 max-w-[280px]`}>
          {t("app_error_go_home_short")}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center px-4 pb-10 pt-12 text-center"
      data-dibay-invite-landing="guest"
    >
      <p className="sam-text-body-secondary text-sam-muted">
        {t(kind === "moim" ? "share_invite_kind_moim" : "share_invite_kind_group")}
      </p>
      {preview.imageUrl ? (
        <SamarketThumbnail
          src={preview.imageUrl}
          alt=""
          size={88}
          className="mt-4"
          roundedClassName={kind === "group" ? "rounded-full" : "rounded-ui-rect"}
        />
      ) : null}
      <h1 className="mt-4 break-words text-[20px] font-bold text-sam-fg">{preview.title}</h1>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">
        {t(inviteMembersKey(preview.memberCount), { count: preview.memberCount })}
      </p>
      {preview.requiresApproval ? (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("share_invite_approval_note")}</p>
      ) : null}
      <div className="mt-8 grid w-full gap-2.5">
        <Link href={loginHref} className={`${Sam.btn.primaryCombo} ${Sam.btn.block}`}>
          {t("share_invite_login_cta")}
        </Link>
        <Link href="/" className={`${Sam.btn.secondaryCombo} ${Sam.btn.block}`}>
          {t("app_error_go_home_short")}
        </Link>
      </div>
    </div>
  );
}
