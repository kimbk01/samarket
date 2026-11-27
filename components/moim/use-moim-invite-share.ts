"use client";

import { useCallback, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useDibayShareSheet } from "@/components/share/use-dibay-share-sheet";
import { buildShareUrl } from "@/lib/share/share-url";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";

/**
 * 모임 머리글 공유 = 초대 링크 (Owner 2026-11-14 §N-3 · G-7: 모임·일정은 비회원 비공개라 밖으로 보낼 수 있는 것은 초대 링크뿐).
 * 초대 링크 권한(manage_invite_link)이 있는 멤버에게만 공유를 그린다. 화면에 머무는 동안 만든 링크 1개를 다시 쓴다.
 * 모임 상세 머리글과 일정 상세 머리글(시안 U5 ⤴ · 감사 F11)이 같이 쓴다.
 */
export function useMoimInviteShare(
  moim: MoimDetailDto | null,
  showToast: (message: string, tone?: "default" | "success" | "error") => void,
  preview?: { title: string; subtitle?: string }
) {
  const { t } = useI18n();
  const canShareInvite = !!moim && moim.viewer.status === "active" && moim.can.manage_invite_link;
  const { openShare, shareSheet } = useDibayShareSheet();
  const inviteUrlRef = useRef<string | null>(null);
  const shareBusyRef = useRef(false);
  const previewTitle = preview?.title;
  const previewSubtitle = preview?.subtitle;
  const shareInvite = useCallback(async () => {
    if (!moim || shareBusyRef.current) return;
    shareBusyRef.current = true;
    try {
      let url = inviteUrlRef.current;
      if (!url) {
        const r = await moimApi.createInviteLink(moim.id, null);
        if (!r.ok) {
          showToast(t(moimErrorKey(r.error)), "error");
          return;
        }
        url = buildShareUrl({ kind: "moim_invite", token: r.token });
        inviteUrlRef.current = url;
      }
      openShare({
        url,
        previewTitle: previewTitle ?? moim.name,
        previewSubtitle: previewSubtitle ?? t("share_invite_kind_moim"),
        previewImageUrl: moim.coverImageUrl,
      });
    } finally {
      shareBusyRef.current = false;
    }
  }, [moim, openShare, t, showToast, previewTitle, previewSubtitle]);
  return { canShareInvite, shareInvite, shareSheet };
}
