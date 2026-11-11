"use client";

import { useState } from "react";
import Link from "next/link";
import { MyFriendQrSheet } from "@/components/community-messenger/friend-qr/MyFriendQrSheet";
import { MemberAtIdText } from "@/components/profile/MemberAtIdText";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { resolveMemberPublicIdUi } from "@/lib/auth/member-public-id-ui-contract";
import { useMemberDiscoverySettings } from "@/lib/auth/use-member-discovery-settings";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";
import { shareCommunityPostViaNative } from "@/lib/community/share/community-share-native";
import { copyTextToClipboard } from "@/lib/community/share/community-share-copy";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";
import type { ProfileRow } from "@/lib/profile/types";
import { Sam } from "@/lib/ui/sam-component-classes";

export function MypageSelfProfileView({ profile }: { profile: ProfileRow }) {
  const { safeT, t } = useI18n();
  const [qrOpen, setQrOpen] = useState(false);
  const displayName = resolveMypageSelfDisplayName(profile) || t("mypage_comp_display_name_empty");
  /** 회원 아이디 1개 · 친구가 나를 찾는 방법 — 단일 계약 (설계안 v3 §3.8) */
  const discovery = useMemberDiscoverySettings();
  const idUi = resolveMemberPublicIdUi(profile, { allowIdSearch: discovery?.allowIdSearch });
  const handle = idUi.atDisplay;
  const bio = (profile.bio ?? "").trim();
  /** 공개 프로필 주소 = 회원 아이디 (`/u/[username]` 은 dibay_id 로 찾는다) */
  const publicHref = idUi.id ? `/u/${encodeURIComponent(idUi.id)}` : null;

  /** 시안 A [아이디 복사] (재감사 N3) */
  const copyId = async () => {
    if (!idUi.id) return;
    const r = await copyTextToClipboard(idUi.id);
    showMypageToast(t(r === "failed" ? "friend_qr_action_failed" : "member_id_copied"), r === "failed" ? "error" : "success");
  };
  /** 시안 A [프로필 공유] — 공개 프로필 주소 (재감사 N3) */
  const shareProfile = async () => {
    if (!publicHref) return;
    const outcome = await shareCommunityPostViaNative({
      title: displayName,
      text: t("friend_qr_share_text"),
      url: `${DIBAY_PRODUCTION_SITE_ORIGIN}${publicHref}`,
    });
    if (outcome === "copied") showMypageToast(t("friend_qr_link_copied"), "success");
    else if (outcome === "failed") showMypageToast(t("friend_qr_action_failed"), "error");
  };

  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={96} alt="" />
      <h1 className="mt-4 max-w-full text-[20px] font-bold leading-[1.35] text-sam-fg [overflow-wrap:anywhere] [text-wrap:balance]">{displayName}</h1>
      {handle ? (
        <p className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-2 text-[14px] text-sam-muted">
          <MemberAtIdText value={handle} />
          {idUi.badgeKey ? <span className={Sam.badge.primary}>{t(idUi.badgeKey)}</span> : null}
          <button
            type="button"
            onClick={() => void copyId()}
            className="text-[12px] font-semibold text-sam-primary underline underline-offset-2"
            data-testid="mypage-copy-id"
          >
            {t("member_id_copy")}
          </button>
        </p>
      ) : null}
      {idUi.hintKey ? (
        <p className="mt-1 max-w-full text-[12px] text-sam-muted">{t(idUi.hintKey, idUi.hintVars)}</p>
      ) : null}
      <p className="mt-3 max-w-full text-[14px] leading-relaxed text-sam-muted [overflow-wrap:anywhere] [text-wrap:balance] [word-break:keep-all]">
        {bio ||
          safeT("mypage_profile_bio_empty")}
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
        {/* 내 QR (설계안 v3 §3.6 · 시안 A) */}
        <button type="button" onClick={() => setQrOpen(true)} className={`${Sam.btn.secondary} w-full justify-center`} data-testid="mypage-my-qr">
          {t("friend_qr_sheet_title")}
        </button>
        {publicHref ? (
          <button
            type="button"
            onClick={() => void shareProfile()}
            className={`${Sam.btn.secondary} w-full justify-center`}
            data-testid="mypage-share-profile"
          >
            {t("member_profile_share")}
          </button>
        ) : null}
        {publicHref ? (
          <Link href={publicHref} className={`${Sam.btn.secondary} w-full justify-center`}>
            {safeT("mypage_view_public_profile")}
          </Link>
        ) : null}
        <Link href={MYPAGE_PROFILE_EDIT_SHEET_HREF} className={`${Sam.btn.primary} w-full justify-center`}>
          {safeT("mypage_settings_profile_edit")}
        </Link>
      </div>
      {qrOpen ? <MyFriendQrSheet onClose={() => setQrOpen(false)} /> : null}
    </div>
  );
}
