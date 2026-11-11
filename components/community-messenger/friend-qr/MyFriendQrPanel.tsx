"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { resolveMemberPublicIdUi } from "@/lib/auth/member-public-id-ui-contract";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { renderFriendQrCardPng, renderFriendQrDataUrl } from "@/lib/community-messenger/friend-qr/friend-qr-image";
import {
  canSaveFriendQrImage,
  requestFriendQrRegenerate,
  saveFriendQrImage,
  shareFriendQr,
} from "@/lib/community-messenger/friend-qr/friend-qr-client";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { MemberAtIdText } from "@/components/profile/MemberAtIdText";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { ProfileRow } from "@/lib/profile/types";

type MyQr = { token: string; url: string };

/**
 * 내 QR (설계안 v3 §3.6 · QR 친구 시안 3판) — QR(가운데 내 사진)·이름·@회원 아이디,
 * 주 [공유] · 보조 [이미지 저장](브라우저만 — 앱은 S3 전까지 숨김) · 글자 [QR 다시 만들기](확인 시트).
 * QR 내용은 아이디가 아닌 토큰 주소 — 아이디를 바꿔도 QR 은 그대로.
 */
export function MyFriendQrPanel() {
  const { t } = useI18n();
  const [qr, setQr] = useState<MyQr | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | "regen" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [canSave, setCanSave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void canSaveFriendQrImage().then((v) => {
      if (!cancelled) setCanSave(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [r, me] = await Promise.all([
          fetch("/api/community-messenger/friend-qr/me", { credentials: "include", cache: "no-store" }),
          getMyProfile().catch(() => null),
        ]);
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; qr?: MyQr };
        if (cancelled) return;
        setProfile(me);
        if (!r.ok || j.ok !== true || !j.qr) {
          setLoadFailed(true);
          return;
        }
        setQr(j.qr);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!qr) return;
    let cancelled = false;
    void renderFriendQrDataUrl(qr.url).then(
      (src) => {
        if (!cancelled) setQrImage(src);
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [qr]);

  const idUi = resolveMemberPublicIdUi(profile);
  const name = profile ? resolveMypageSelfDisplayName(profile) : "";

  const avatarSrc = resolveUserAvatarImageSrc(profile?.avatar_url);
  const renderCard = useCallback(
    () => (qr ? renderFriendQrCardPng({ url: qr.url, name, atId: idUi.atDisplay, avatarUrl: avatarSrc }) : Promise.reject(new Error("no_qr"))),
    [avatarSrc, idUi.atDisplay, name, qr],
  );

  /** 공유 = QR 카드 이미지 + 링크 글. 공유 창을 닫으면(취소) 아무 문구도 띄우지 않는다 (재감사 Q2) */
  const share = useCallback(async () => {
    if (!qr || busy) return;
    setBusy("share");
    try {
      const image = await renderCard().catch(() => null);
      const outcome = await shareFriendQr({ title: name, text: t("friend_qr_share_text"), url: qr.url, image });
      if (outcome === "copied") showMessengerSnackbar(t("friend_qr_link_copied"), { variant: "success" });
      else if (outcome === "failed") showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  }, [busy, name, qr, renderCard, t]);

  /** 브라우저 내려받기만 — 앱에서는 버튼이 없다 (재감사 Q1: 저장 안 됐는데 「저장했어요」 금지) */
  const save = useCallback(async () => {
    if (!qr || busy || !canSave) return;
    setBusy("save");
    try {
      const outcome = await saveFriendQrImage(await renderCard());
      if (outcome === "saved") showMessengerSnackbar(t("friend_qr_saved"), { variant: "success" });
      else if (outcome === "failed") showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } catch {
      showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  }, [busy, canSave, qr, renderCard, t]);

  const regenerate = useCallback(async () => {
    setConfirmOpen(false);
    if (busy) return;
    setBusy("regen");
    try {
      const next = await requestFriendQrRegenerate();
      if (!next) {
        showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
        return;
      }
      setQrImage(null);
      setLoadFailed(false);
      setQr(next);
      showMessengerSnackbar(t("friend_qr_regenerated"), { variant: "success" });
    } finally {
      setBusy(null);
    }
  }, [busy, t]);

  /** 토큰 조회 실패든 QR 그림 만들기 실패든 같은 오류 화면 — 빈 자리표시·누를 수 있는 버튼이 남지 않게 */
  if (loadFailed && !qrImage) {
    return (
      <p className="px-3 py-6 text-center text-[length:var(--overlay-body-2-size)]" style={{ color: "var(--overlay-danger)" }}>
        {t("friend_qr_load_failed")}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="my-friend-qr">
      {/** 카드 — 시트 토큰만. 이름·아이디는 말줄임 없이 줄바꿈 (QR 친구 시안 3판 화면 규칙) */}
      <div className="grid justify-items-center gap-1 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 pb-4 pt-[18px] text-center">
        <div className="relative aspect-square w-[min(184px,70%)]">
          {qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL QR 이미지
            <img src={qrImage} alt="" className="h-full w-full" />
          ) : (
            <div className="h-full w-full animate-pulse rounded-ui-rect bg-sam-border-soft" aria-hidden />
          )}
          {qrImage && profile ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[color:var(--overlay-surface)]">
              <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={40} alt="" />
            </div>
          ) : null}
        </div>
        <p
          className="mt-2 max-w-full text-[length:var(--overlay-body-1-size)] font-bold leading-[1.35] [overflow-wrap:anywhere] [text-wrap:balance]"
          style={{ color: "var(--overlay-text-primary)" }}
        >
          {name}
        </p>
        {idUi.atDisplay ? (
          <p className="max-w-full font-semibold leading-[1.35] text-sam-primary">
            <MemberAtIdText value={idUi.atDisplay} />
          </p>
        ) : null}
        <p className="mt-0.5 text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
          {t("friend_qr_my_hint")}
        </p>
      </div>
      {/**
       * CTA 위계 (설계안 v3 §3.6 · 텔레그램·라인 내 QR 화면): 주 행동 「공유」 + 보조 「이미지 저장」 두 칸,
       * 드물고 되돌릴 수 없는 「QR 다시 만들기」는 같은 무게 버튼으로 두지 않고 아래 글자 버튼(확인 시트 거침).
       */}
      <div className="dibay-overlay-actions dibay-overlay-actions--row !mt-0">
        <button type="button" className="dibay-overlay-btn dibay-overlay-btn--primary whitespace-nowrap" disabled={!qr || !qrImage || busy !== null} onClick={() => void share()}>
          {t("friend_qr_share")}
        </button>
        {canSave ? (
          <button type="button" className="dibay-overlay-btn dibay-overlay-btn--secondary whitespace-nowrap" disabled={!qr || !qrImage || busy !== null} onClick={() => void save()}>
            {t("friend_qr_save_image")}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="dibay-overlay-btn dibay-overlay-btn--text whitespace-nowrap"
        disabled={!qr || !qrImage || busy !== null}
        onClick={() => setConfirmOpen(true)}
        data-testid="friend-qr-regenerate"
      >
        {t("friend_qr_regenerate")}
      </button>
      <MobileConfirmBottomSheet
        open={confirmOpen}
        title={t("friend_qr_regenerate_title")}
        description={t("friend_qr_regenerate_note")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("friend_qr_regenerate")}
        confirmTone="primary"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void regenerate()}
      />
    </div>
  );
}
