"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { renderFriendQrCardPng, renderFriendQrDataUrl } from "@/lib/community-messenger/friend-qr/friend-qr-image";
import {
  isFriendQrNativeApp,
  requestFriendQrRegenerate,
  saveFriendQrImage,
  shareFriendQr,
} from "@/lib/community-messenger/friend-qr/friend-qr-client";
import { FRIEND_QR_SETTINGS_HREF } from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { formatAtUsername } from "@/lib/users/user-label";
import { MemberAtIdText } from "@/components/profile/MemberAtIdText";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

type MyQr = { token: string; url: string };
type Owner = { displayName: string; dibayId: string | null; avatarUrl: string | null };
type Loaded = { qr: MyQr; owner: Owner; qrAddAllowed: boolean };

/**
 * 내 QR (설계안 v3 §3.6 · QR 친구 시안 3판 · 근본 재감사 G1~G3)
 *
 * 배치(고정 높이 시트 안 위아래 칸): [카드: QR 칸(남은 공간) · 이름 · @아이디 · 안내] [공유 · 이미지 저장] [QR 다시 만들기]
 * - QR 칸만 남은 공간을 채운다: QR 한 변 = min(칸 높이, 200px), 최소 120px. 200px < 가장 좁은 본문 폭 312px 이라 항상 정사각형.
 * - 데이터는 `/friend-qr/me` 한 번(토큰·이름·@아이디·사진·QR 허용) — 불러오는 동안 같은 크기 자리표시라 글자가 늦게 와도 배치가 안 바뀐다.
 * - 「QR로 친구 추가 허용」을 끈 회원: QR 대신 안내 + [설정에서 켜기] (남이 찍으면 DB 가 막는 QR 을 정상처럼 보이지 않게).
 * - CTA: 주 [공유] · 보조 [이미지 저장](브라우저만 — 앱은 S3 전까지 숨김) · 글자 [QR 다시 만들기](확인 시트).
 */
export function MyFriendQrPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Loaded | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<"share" | "regen" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** 앱(Capacitor) 여부 — 모르는 동안(null)은 [이미지 저장]을 보이지 않는다. 앱에서는 숨김(S3 전, 재감사 Q1) */
  const [native, setNative] = useState<boolean | null>(null);
  /**
   * 공유·저장용 카드 PNG — 미리 만들어 둔다. 누른 뒤 만들면 브라우저가 공유 창을 막는다 (PR #154 리뷰).
   * 만드는 중(pending)에는 브라우저 [공유]·[이미지 저장]을 막는다. 실패(failed)면 공유는 링크로, 저장은 막힌다.
   */
  const [card, setCard] = useState<{ status: "pending" } | { status: "ready"; blob: Blob } | { status: "failed" }>({
    status: "pending",
  });
  const cardBlob = card.status === "ready" ? card.blob : null;
  const qr = data?.qr ?? null;
  const allowed = data?.qrAddAllowed !== false;
  const name = data ? data.owner.displayName || t("friend_qr_member_fallback") : "";
  const atId = data?.owner.dibayId ? formatAtUsername(data.owner.dibayId) : null;
  const avatarSrc = resolveUserAvatarImageSrc(data?.owner.avatarUrl);

  useEffect(() => {
    setNative(isFriendQrNativeApp());
  }, []);
  const canSave = native === false;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/community-messenger/friend-qr/me", { credentials: "include", cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; qr?: MyQr; owner?: Owner; qrAddAllowed?: boolean };
        if (cancelled) return;
        if (!r.ok || j.ok !== true || !j.qr || !j.owner) {
          setLoadFailed(true);
          return;
        }
        setData({ qr: j.qr, owner: j.owner, qrAddAllowed: j.qrAddAllowed !== false });
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

  useEffect(() => {
    setCard({ status: "pending" });
    if (!qr || !data) return;
    let cancelled = false;
    void renderFriendQrCardPng({ url: qr.url, name, atId, avatarUrl: avatarSrc }).then(
      (blob) => {
        if (!cancelled) setCard({ status: "ready", blob });
      },
      () => {
        if (!cancelled) setCard({ status: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [atId, avatarSrc, data, name, qr]);

  /** 공유 = QR 카드 이미지 + 링크 글. 누른 동작 안에서 바로 연다 — 앞에서 기다리지 않는다. 취소는 문구 없음 (재감사 Q2) */
  const share = useCallback(async () => {
    if (!qr || busy || native === null || (native === false && card.status === "pending")) return;
    setBusy("share");
    try {
      const outcome = await shareFriendQr({ native, title: name, text: t("friend_qr_share_text"), url: qr.url, image: cardBlob });
      if (outcome === "copied") showMessengerSnackbar(t("friend_qr_link_copied"), { variant: "success" });
      else if (outcome === "failed") showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  }, [busy, card.status, cardBlob, name, native, qr, t]);

  /** 브라우저 내려받기만 — 앱에서는 버튼이 없다 (재감사 Q1: 저장 안 됐는데 「저장했어요」 금지) */
  const save = useCallback(() => {
    if (!cardBlob || busy || !canSave) return;
    const outcome = saveFriendQrImage(cardBlob);
    if (outcome === "saved") showMessengerSnackbar(t("friend_qr_saved"), { variant: "success" });
    else if (outcome === "failed") showMessengerSnackbar(t("friend_qr_action_failed"), { variant: "error" });
  }, [busy, canSave, cardBlob, t]);

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
      setData((prev) => (prev ? { ...prev, qr: next } : prev));
      showMessengerSnackbar(t("friend_qr_regenerated"), { variant: "success" });
    } finally {
      setBusy(null);
    }
  }, [busy, t]);

  const failed = loadFailed && !qrImage;
  const ready = Boolean(qr && qrImage && !failed);
  /** 자리표시 줄 — 글자 한 줄과 같은 높이(글자 크기 × 1.35) */
  const lineSkeleton = (widthClass: string) => (
    <span className={`block h-[1.35em] ${widthClass} animate-pulse rounded-ui-rect bg-sam-border-soft`} aria-hidden />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="my-friend-qr">
      {/** 카드 — 남은 높이를 채운다. 안의 QR 칸만 늘고 준다 */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 pb-4 pt-[18px] text-center">
        <div className="flex min-h-[120px] w-full flex-1 items-center justify-center" data-testid="my-friend-qr-area">
          {failed ? (
            <p className="text-[length:var(--overlay-body-2-size)]" style={{ color: "var(--overlay-danger)" }} role="alert">
              {t("friend_qr_load_failed")}
            </p>
          ) : data && !allowed ? (
            <div className="flex flex-col items-center gap-2" data-testid="my-friend-qr-off">
              <p className="text-[length:var(--overlay-body-2-size)] font-semibold" style={{ color: "var(--overlay-text-primary)" }}>
                {t("friend_qr_add_off")}
              </p>
              <Link
                href={FRIEND_QR_SETTINGS_HREF}
                className="text-[length:var(--overlay-body-2-size)] font-semibold text-sam-primary underline underline-offset-2"
              >
                {t("friend_qr_add_off_cta")}
              </Link>
            </div>
          ) : (
            /** QR 정사각형 — 칸 높이를 따르되 최대 200px (항상 본문 폭보다 작아 정사각형 유지) */
            <div className="relative aspect-square h-full max-h-[200px]">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL QR 이미지
                <img src={qrImage} alt="" className="h-full w-full" />
              ) : (
                <div className="h-full w-full animate-pulse rounded-ui-rect bg-sam-border-soft" aria-hidden />
              )}
              {qrImage && data ? (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[color:var(--overlay-surface)]">
                  <SamarketUserAvatar avatarUrl={data.owner.avatarUrl} sizePx={40} alt="" />
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div
          className="mt-2 flex w-full shrink-0 justify-center text-[length:var(--overlay-body-1-size)] font-bold leading-[1.35]"
          style={{ color: "var(--overlay-text-primary)" }}
        >
          {data ? (
            <p className="max-w-full [overflow-wrap:anywhere] [text-wrap:balance]">{name}</p>
          ) : failed ? null : (
            lineSkeleton("w-28")
          )}
        </div>
        <div className="flex w-full shrink-0 justify-center font-semibold leading-[1.35] text-sam-primary">
          {data ? (
            atId ? (
              <p className="max-w-full">
                <MemberAtIdText value={atId} />
              </p>
            ) : null
          ) : failed ? null : (
            lineSkeleton("w-20")
          )}
        </div>
        {/** 「스캔하면 바로 친구」 안내는 QR 이 실제로 쓰일 때만 — QR 끔·불러오기 실패에서는 모순이라 숨김 (전체 실기 감사 2026-11-12) */}
        {!failed && allowed ? (
          <p className="mt-0.5 shrink-0 text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
            {t("friend_qr_my_hint")}
          </p>
        ) : null}
      </div>
      {/**
       * CTA 위계 (설계안 v3 §3.6 · 라인 내 QR 화면): 주 [공유] + 보조 [이미지 저장] 한 줄,
       * 드물고 되돌릴 수 없는 [QR 다시 만들기]는 아래 글자 버튼(확인 시트 거침). QR 허용을 끄면 둘 다 막는다.
       */}
      <div className="dibay-overlay-actions dibay-overlay-actions--row !mt-0 shrink-0">
        <button
          type="button"
          className="dibay-overlay-btn dibay-overlay-btn--primary whitespace-nowrap"
          disabled={!ready || !allowed || native === null || (native === false && card.status === "pending") || busy !== null}
          onClick={() => void share()}
        >
          {t("friend_qr_share")}
        </button>
        {canSave ? (
          <button
            type="button"
            className="dibay-overlay-btn dibay-overlay-btn--secondary whitespace-nowrap"
            disabled={!cardBlob || !allowed || busy !== null}
            onClick={save}
          >
            {t("friend_qr_save_image")}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="dibay-overlay-btn dibay-overlay-btn--text shrink-0 whitespace-nowrap"
        disabled={!ready || !allowed || busy !== null}
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
