"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet, dibayConfirm, type DibayActionSheetItem } from "@/components/ui/dibay-overlay";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, SAM_TIER1_HEADER_ICON_GLYPH_CLASS, samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import type { MoimAction } from "@/lib/moim/moim-permission-contract";
import { DibayHeaderShareButton } from "@/components/share/DibayHeaderShareButton";
import { useDibayShareSheet } from "@/components/share/use-dibay-share-sheet";
import { buildShareUrl } from "@/lib/share/share-url";
import { MoimMemberView } from "@/components/moim/MoimMemberView";
import { MoimPublicView } from "@/components/moim/MoimPublicView";
import { MoimReportSheet, type MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";
import { canRequestMoimHostChange } from "@/components/moim/manage/MoimManageHub";

/** 운영 관리 메뉴를 보여 줄 권한 (멤버 누구나 가진 권한은 제외) */
const MANAGE_ACTIONS: readonly MoimAction[] = [
  "edit_info",
  "decide_join",
  "manage_invite_link",
  "manage_boards",
  "remove_member",
  "ban_member",
  "write_note",
  "set_role",
  "transfer_host",
  "close",
];

export function useMoimDetail(moimId: string) {
  const [moim, setMoim] = useState<MoimDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    void moimApi.detail(moimId).then((r) => {
      if (!alive) return;
      if (r.ok) setMoim(r.moim);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [moimId, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { moim, error, reload };
}

/** 모임장 위임 요청 받음 — 수락·거절 */
function HostTransferBanner({ transferId, onDone, onToast }: { transferId: string; onDone: () => void; onToast: (m: string, tone?: "default" | "success" | "error") => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const respond = async (accept: boolean) => {
    setBusy(true);
    const r = await moimApi.respondHostTransfer(transferId, accept);
    setBusy(false);
    if (!r.ok) {
      onToast(t(moimErrorKey(r.error)), "error");
      return;
    }
    onToast(accept ? t("moim_transfer_accepted_toast") : t("moim_transfer_declined_toast"));
    onDone();
  };
  return (
    <div className={`${moimCls.noticeInfo} mx-4 mt-3 grid gap-2`}>
      <p className="text-[13px] font-bold">{t("moim_transfer_banner")}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} flex-1`} onClick={() => respond(false)}>
          {t("common_reject")}
        </button>
        <button type="button" disabled={busy} className={`${moimCls.btnPrimary} ${moimCls.btnSm} flex-1`} onClick={() => respond(true)}>
          {t("common_accept")}
        </button>
      </div>
    </div>
  );
}

/** /moim/[id] — 비멤버는 공개 페이지(U3), 활성 멤버는 모임 홈(U4) */
export function MoimDetailScreen({ moimId, inviteToken }: { moimId: string; inviteToken?: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useMoimToast();
  const showToast = toast.show;
  const { moim, error, reload } = useMoimDetail(moimId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [report, setReport] = useState<MoimReportTarget | null>(null);

  const isMember = moim?.viewer.status === "active";
  /**
   * 모임 상세 공유 = 초대 링크 (Owner 2026-11-14 §N-3 · G-7: 모임 상세는 비회원 비공개라 밖으로 보낼 수 있는 것은 초대 링크뿐).
   * 초대 링크 권한(manage_invite_link)이 있는 멤버에게만 머리글 공유를 그린다. 화면에 머무는 동안 만든 링크 1개를 다시 쓴다.
   */
  const canShareInvite = !!moim && isMember && moim.can.manage_invite_link;
  const { openShare, shareSheet } = useDibayShareSheet();
  const inviteUrlRef = useRef<string | null>(null);
  const shareBusyRef = useRef(false);
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
        previewTitle: moim.name,
        previewSubtitle: t("share_invite_kind_moim"),
        previewImageUrl: moim.coverImageUrl,
      });
    } finally {
      shareBusyRef.current = false;
    }
  }, [moim, openShare, t, showToast]);
  // 부모임장·운영진은 권한이 없어도 「모임장 변경 요청」(P8 미접속 위임) 때문에 운영 메뉴를 연다
  const canManage = !!moim && (MANAGE_ACTIONS.some((a) => moim.can[a]) || canRequestMoimHostChange(moim));

  const rightSlot = useMemo(
    () =>
      moim ? (
        <div className={samTier1HeaderIconCluster}>
          {canShareInvite ? (
            <DibayHeaderShareButton
              onClick={() => void shareInvite()}
              buttonClassName={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
              glyphClassName={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
            />
          ) : null}
          <button type="button" className={SAM_TIER1_HEADER_ACTION_BTN_CLASS} aria-label={t("moim_menu_aria")} onClick={() => setMenuOpen(true)}>
            <MoreVertical className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null,
    [moim, t, canShareInvite, shareInvite]
  );
  const header = useMemo(
    () => ({ titleText: moim?.name ?? t("moim_tab"), backHref: moimRoutes.tab, rightSlot }),
    [moim?.name, rightSlot, t]
  );
  useRegisterMainTier1Header(header);

  const leave = useCallback(async () => {
    if (!moim) return;
    const ok = await dibayConfirm({
      title: t("moim_leave_confirm_title"),
      description: t("moim_leave_confirm_body"),
      confirmLabel: t("moim_menu_leave"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    const r = await moimApi.leave(moim.id);
    if (!r.ok) {
      toast.show(t(moimErrorKey(r.error)), "error");
      return;
    }
    toast.show(t("moim_leave_done_toast"));
    reload();
  }, [moim, reload, t, toast]);

  if (error) {
    return (
      <div className={moimCls.page}>
        <MoimErrorState messageKey={moimErrorKey(error)} onRetry={error === "moim_not_found" ? undefined : reload} />
      </div>
    );
  }
  if (!moim) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <div className="mb-3 h-[140px] w-full animate-pulse bg-sam-surface-muted" />
        <MoimListSkeleton rows={2} />
      </div>
    );
  }

  const items: DibayActionSheetItem[] = [];
  /** 바깥 공유(초대 링크)는 머리글 1곳 — 메뉴에는 DIBAY 친구 초대(초대 관리 화면)만 */
  if (isMember && moim.can.send_invite) {
    items.push({ key: "invite", label: t("moim_invite_friend_btn"), onClick: () => router.push(moimRoutes.manageInvite(moim.id)) });
  }
  if (isMember) items.push({ key: "profile", label: t("moim_menu_profile"), onClick: () => router.push(moimRoutes.profile(moim.id)) });
  if (isMember) {
    items.push({ key: "notifications", label: t("moim_menu_notifications"), onClick: () => router.push(moimRoutes.notificationSettings(moim.id)) });
  }
  if (isMember && canManage) items.push({ key: "manage", label: t("moim_menu_manage"), onClick: () => router.push(moimRoutes.manage(moim.id)) });
  if (moim.viewer.loggedIn) items.push({ key: "report", label: t("moim_menu_report"), onClick: () => setReport({ type: "moim", id: moim.id }) });
  if (isMember) items.push({ key: "leave", label: t("moim_menu_leave"), danger: true, onClick: () => void leave() });

  return (
    <>
      {moim.viewer.incomingHostTransferId ? (
        <div className={moimCls.column}>
          <HostTransferBanner transferId={moim.viewer.incomingHostTransferId} onDone={reload} onToast={toast.show} />
        </div>
      ) : null}
      {isMember ? (
        <MoimMemberView moim={moim} onReport={setReport} onToast={toast.show} />
      ) : (
        <MoimPublicView moim={moim} inviteToken={inviteToken} onChanged={reload} onToast={toast.show} />
      )}
      <DibayActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        cancelLabel={t("common_cancel")}
        items={items}
        notice={items.length === 0 ? t("moim_menu_empty") : undefined}
      />
      {shareSheet}
      <MoimReportSheet moimId={moim.id} target={report} onClose={() => setReport(null)} onDone={(m) => toast.show(m, "success")} />
      {toast.node}
    </>
  );
}
