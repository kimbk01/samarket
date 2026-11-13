"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Share2, UserPlus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet } from "@/components/ui/dibay-overlay";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import { canUsePlatformShare, shareViaPlatform } from "@/lib/share/platform-share";
import { buildShareUrl, isProductionShareContext } from "@/lib/share/share-url";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import { moimCls } from "@/components/moim/moim-ui";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 초대하기 시트 (시안 U6) — 링크는 운영 권한(manage_invite_link), 친구 초대는 운영 화면(send_invite) */
export function MoimInviteSheet({
  open,
  onClose,
  moim,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  moim: MoimDetailDto;
  onToast: (message: string, tone?: "default" | "success" | "error") => void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canLink = moim.can.manage_invite_link;
  const canFriend = moim.can.send_invite;

  /** 「다른 앱으로 공유」 = 앱이거나 Web Share 지원 + 운영 주소일 때만 (S1) */
  const [nativeShareOk, setNativeShareOk] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setNativeShareOk(canUsePlatformShare() && isProductionShareContext());
  }, [open]);

  const ensureLink = async (): Promise<string | null> => {
    if (link) return link;
    setBusy(true);
    const r = await moimApi.createInviteLink(moim.id, null);
    setBusy(false);
    if (!r.ok) {
      setError(t(moimErrorKey(r.error)));
      return null;
    }
    const url = buildShareUrl({ kind: "moim_invite", token: r.token });
    if (!url) return null;
    setLink(url);
    return url;
  };

  const onCopy = async () => {
    const url = await ensureLink();
    if (!url) return;
    onToast((await copyText(url)) ? t("moim_invite_copied_toast") : t("moim_invite_copy_failed_toast"), "default");
  };

  /** 통합 공유 결과 계약(§I-1): 취소·넘김 = 아무 것도 안 함 · 실패 = 안내만(자동 복사 없음) */
  const onShare = async () => {
    const url = await ensureLink();
    if (!url) return;
    const result = await shareViaPlatform({ title: moim.name, url });
    if (result === "failed" || result === "unavailable") onToast(t("share_toast_failed"), "error");
  };

  const row = "flex w-full items-center gap-3 px-1 py-3 text-left text-[15px] text-sam-fg disabled:text-sam-muted";

  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      preferredHeightRatio={null}
      header={<DibaySheetHeader title={t("moim_invite_title")} onClose={onClose} closeLabel={t("common_close")} />}
    >
      <div className="grid gap-1 px-4 pb-4">
        {canLink ? (
          <>
            {link ? <p className={`${moimCls.card} break-all px-3 py-2 text-[13px] text-sam-muted`}>{link}</p> : null}
            <button type="button" className={row} disabled={busy} onClick={onCopy}>
              <Copy className="h-5 w-5 text-sam-primary" aria-hidden />
              {t("moim_invite_copy_btn")}
            </button>
            {nativeShareOk ? (
              <button type="button" className={row} disabled={busy} onClick={onShare}>
                <Share2 className="h-5 w-5 text-sam-primary" aria-hidden />
                {t("moim_invite_share_btn")}
              </button>
            ) : null}
          </>
        ) : null}
        {canFriend ? (
          <Link href={moimRoutes.manageInvite(moim.id)} className={row} onClick={onClose}>
            <UserPlus className="h-5 w-5 text-sam-primary" aria-hidden />
            {t("moim_invite_friend_btn")}
          </Link>
        ) : null}
        {!canLink && !canFriend ? <p className={moimCls.hint}>{t("moim_invite_no_permission")}</p> : null}
        {canLink && moim.joinMode === "approval" ? <p className={`${moimCls.noticeInfo} mt-2`}>{t("moim_invite_approval_note")}</p> : null}
        {error ? <p className={`${moimCls.noticeBad} mt-2`}>{error}</p> : null}
      </div>
    </DibayUsableAreaSheet>
  );
}
