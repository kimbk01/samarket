"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { resolveMemberPublicIdUi } from "@/lib/auth/member-public-id-ui-contract";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { renderFriendQrCardPng, renderFriendQrDataUrl } from "@/lib/community-messenger/friend-qr/friend-qr-image";
import { shareCommunityPostViaNative } from "@/lib/community/share/community-share-native";
import { shareOrSaveReceiptImage } from "@/lib/mypage/store-order-receipt-image";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { ProfileRow } from "@/lib/profile/types";

type MyQr = { token: string; url: string };

/**
 * 내 QR (설계안 v3 §3.6 · 시안 B) — QR(가운데 내 사진)·이름·@회원 아이디, [공유] [이미지 저장] [QR 다시 만들기].
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

  const share = useCallback(async () => {
    if (!qr || busy) return;
    setBusy("share");
    try {
      const outcome = await shareCommunityPostViaNative({ title: name, text: t("friend_qr_share_text"), url: qr.url });
      if (outcome === "copied") showMessengerSnackbar(t("friend_qr_link_copied"), { variant: "success" });
      else if (outcome === "failed") showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  }, [busy, name, qr, t]);

  const save = useCallback(async () => {
    if (!qr || busy) return;
    setBusy("save");
    try {
      const png = await renderFriendQrCardPng({ url: qr.url, name, atId: idUi.atDisplay });
      const result = await shareOrSaveReceiptImage(png, "dibay-qr.png", name);
      if (result === "saved") showMessengerSnackbar(t("friend_qr_saved"), { variant: "success" });
    } catch {
      showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  }, [busy, idUi.atDisplay, name, qr, t]);

  const regenerate = useCallback(async () => {
    setConfirmOpen(false);
    if (busy) return;
    setBusy("regen");
    try {
      const r = await fetch("/api/community-messenger/friend-qr/regenerate", { method: "POST", credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; qr?: MyQr };
      if (!r.ok || j.ok !== true || !j.qr) {
        showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
        return;
      }
      setQrImage(null);
      setQr(j.qr);
      showMessengerSnackbar(t("friend_qr_regenerated"), { variant: "success" });
    } catch {
      showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  }, [busy, t]);

  if (loadFailed && !qr) {
    return (
      <p className="px-3 py-6 text-center text-[length:var(--overlay-body-2-size)]" style={{ color: "var(--overlay-danger)" }}>
        {t("friend_qr_load_failed")}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="my-friend-qr">
      <div className="grid justify-items-center gap-2 rounded-[length:var(--overlay-radius-md)] bg-white px-4 py-5">
        <div className="relative aspect-square w-[200px] max-w-full">
          {qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL QR 이미지
            <img src={qrImage} alt="" className="h-full w-full" />
          ) : (
            <div className="h-full w-full animate-pulse rounded-ui-rect bg-sam-border-soft" aria-hidden />
          )}
          {qrImage && profile ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white">
              <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={40} alt="" />
            </div>
          ) : null}
        </div>
        <p className="text-[16px] font-bold text-sam-fg">{name}</p>
        {idUi.atDisplay ? <p className="text-[14px] font-semibold text-sam-primary">{idUi.atDisplay}</p> : null}
        <p className="text-[12px] text-sam-muted">{t("friend_qr_my_hint")}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="dibay-overlay-btn dibay-overlay-btn--secondary" disabled={!qr || busy !== null} onClick={() => void share()}>
          {t("friend_qr_share")}
        </button>
        <button type="button" className="dibay-overlay-btn dibay-overlay-btn--secondary" disabled={!qr || busy !== null} onClick={() => void save()}>
          {t("friend_qr_save_image")}
        </button>
        <button
          type="button"
          className="dibay-overlay-btn dibay-overlay-btn--secondary"
          disabled={!qr || busy !== null}
          onClick={() => setConfirmOpen(true)}
          data-testid="friend-qr-regenerate"
        >
          {t("friend_qr_regenerate")}
        </button>
      </div>
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
