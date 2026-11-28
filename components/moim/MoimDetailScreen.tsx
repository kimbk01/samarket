"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreVertical, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet, dibayConfirm, type DibayActionSheetItem } from "@/components/ui/dibay-overlay";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, SAM_TIER1_HEADER_ICON_GLYPH_CLASS, samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import { MOIM_TRANSFER_STALE_ERRORS, moimAfterLeaveHref, moimHostTransferGate } from "@/lib/moim/moim-state-gate";
import { DibayHeaderShareButton } from "@/components/share/DibayHeaderShareButton";
import { MoimMemberView } from "@/components/moim/MoimMemberView";
import { useMoimInviteShare } from "@/components/moim/use-moim-invite-share";
import { useMoimNotificationRead } from "@/lib/moim/use-moim-notification-read";
import { MoimPublicView } from "@/components/moim/MoimPublicView";
import { MoimReportSheet, type MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";
import { canOpenMoimTransfer } from "@/components/moim/manage/MoimManageHub";
import { canOpenMoimManageHub } from "@/components/moim/manage/moim-manage-shared";

/** R4 #15: 모임 머리글 ⋮ — 로그인했을 때만 (메뉴 항목이 모두 로그인 뒤에만 생긴다) */
export function moimDetailMenuVisible(moim: Pick<MoimDetailDto, "viewer">): boolean {
  return moim.viewer.loggedIn;
}

/** 모임 상세 — 화면끼리 공유(60초·쓰기 성공 시 비움, 감사 E2). reload() = 저장값 무시하고 다시 */
export function useMoimDetail(moimId: string) {
  const [moim, setMoim] = useState<MoimDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    void moimApi.detail(moimId, { force: key > 0 }).then((r) => {
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

/**
 * 모임장 위임 요청 받음 — 수락·거절.
 * R5 C7: 경고·차단·종료 모임은 수락 버튼 대신 안내 1줄(거절은 늘 된다). 낡은 요청으로 실패하면 다시 불러와 배너를 걷는다.
 */
export function HostTransferBanner({
  transferId,
  moim,
  onDone,
  onToast,
}: {
  transferId: string;
  moim: Pick<MoimDetailDto, "status" | "platformState">;
  onDone: () => void;
  onToast: (m: string, tone?: "default" | "success" | "error") => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const gate = moimHostTransferGate(moim);
  const respond = async (accept: boolean) => {
    /** R3 W4·G-dng-01: 거절은 위험 동작 — 확인 후 */
    if (!accept) {
      const ok = await dibayConfirm({
        title: t("moim_transfer_decline_confirm_title"),
        description: t("moim_transfer_decline_confirm_body"),
        confirmLabel: t("common_reject"),
        cancelLabel: t("common_cancel"),
        confirmTone: "destructive",
      });
      if (!ok) return;
    }
    setBusy(true);
    const r = await moimApi.respondHostTransfer(transferId, accept);
    setBusy(false);
    if (!r.ok) {
      // 결정 1 — 수락은 가입 필요: 「가입 이어하기」 창이 이미 떴다 → 토스트를 겹쳐 띄우지 않는다
      if (r.code === "signup_incomplete") return;
      onToast(t(moimErrorKey(r.error)), "error");
      if (MOIM_TRANSFER_STALE_ERRORS.has(r.error)) onDone();
      return;
    }
    onToast(accept ? t("moim_transfer_accepted_toast") : t("moim_transfer_declined_toast"));
    onDone();
  };
  return (
    <div className={`${moimCls.noticeInfo} mx-4 mt-3 grid gap-2`}>
      <p className="text-[13px] font-bold">{t("moim_transfer_banner")}</p>
      {gate.blockedKey ? <p className="text-[12px]">{t(gate.blockedKey)}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={`${moimCls.btnDanger} ${moimCls.btnSm} flex-1`} onClick={() => void respond(false)}>
          {t("common_reject")}
        </button>
        {gate.canAccept ? (
          <button type="button" disabled={busy} className={`${moimCls.btnPrimary} ${moimCls.btnSm} flex-1`} onClick={() => void respond(true)}>
            {t("common_accept")}
          </button>
        ) : null}
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
  /** R2 N-06: 이 화면으로 가는 모임 알림 읽음 (정책 §2) */
  useMoimNotificationRead(`/moim/${moimId}`, !!moim);
  const [menuOpen, setMenuOpen] = useState(false);
  const [report, setReport] = useState<MoimReportTarget | null>(null);

  const isMember = moim?.viewer.status === "active";
  /**
   * 모임 상세 공유 = 초대 링크 (Owner 2026-11-14 §N-3 · G-7: 모임 상세는 비회원 비공개라 밖으로 보낼 수 있는 것은 초대 링크뿐).
   * 초대 링크 권한(manage_invite_link)이 있는 멤버에게만 머리글 공유를 그린다. 화면에 머무는 동안 만든 링크 1개를 다시 쓴다.
   */
  const { canShareInvite, shareInvite, shareSheet } = useMoimInviteShare(moim, showToast);
  /**
   * 운영 관리 메뉴 = 운영 허브를 열 수 있는 사람 (R5 C1 — 허브 「뒤로」와 같은 판정 하나).
   * 부모임장·운영진은 권한이 없어도 「모임장 변경 요청」(P8 미접속 위임) 때문에 운영 메뉴를 연다.
   */
  const canManage = !!moim && canOpenMoimManageHub(moim);

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
          {/* 시안 U4 머리글 ⌕ — 모임 안 검색 (감사 F11 · 멤버만) */}
          {isMember ? (
            <button
              type="button"
              className={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
              aria-label={t("moim_search_in_title")}
              onClick={() => router.push(moimRoutes.searchIn(moim.id))}
            >
              <Search className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          {/* R4 #15: 로그아웃 방문자에게는 메뉴 항목이 없다(신고·멤버 메뉴 모두 로그인 필요) → ⋮ 를 그리지 않는다 */}
          {moimDetailMenuVisible(moim) ? (
            <button type="button" className={SAM_TIER1_HEADER_ACTION_BTN_CLASS} aria-label={t("moim_menu_aria")} onClick={() => setMenuOpen(true)}>
              <MoreVertical className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null,
    [moim, t, canShareInvite, shareInvite, isMember, router]
  );
  /**
   * R3 U3-hdr-title: 비회원 공개 페이지는 머리글 제목을 비운다(이름은 본문 <h1>) — 시안 U3.
   * 빈 글자는 머리글이 「내용 없음」으로 바꾸므로, 화면에 안 보이는 이름(읽어 주기용)을 넣는다.
   */
  const publicPage = !!moim && !isMember;
  const header = useMemo(
    () =>
      publicPage && moim
        ? { title: <span className="sr-only">{moim.name}</span>, backHref: moimRoutes.tab, rightSlot }
        : { titleText: moim?.name ?? t("moim_tab"), backHref: moimRoutes.tab, rightSlot },
    [publicPage, moim, rightSlot, t]
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
    /** R5 B15: 종료 모임에서 나가면 다시 불러와도 열 수 없다 → 모임 탭으로 */
    const next = moimAfterLeaveHref(moim, moimRoutes.tab);
    if (next) router.replace(next);
    else reload();
  }, [moim, reload, router, t, toast]);

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
  /**
   * 모임장은 위임 전에는 나갈 수 없다(설계 P5 · 감사 D5) — 「나가기」 대신 위임·종료로 안내.
   * 다른 역할은 그대로 「모임 나가기」. 메뉴 순서: 일반(위임하기 포함) → 신고 → 위험 (R3 1-1)
   */
  const hostMenu = isMember && moim.viewer.role === "host";
  if (hostMenu && canOpenMoimTransfer(moim)) {
    items.push({ key: "transfer", label: t("moim_manage_transfer_title"), onClick: () => router.push(moimRoutes.manageTransfer(moim.id)) });
  }
  if (moim.viewer.loggedIn) items.push({ key: "report", label: t("moim_menu_report"), onClick: () => setReport({ type: "moim", id: moim.id }) });
  if (hostMenu) {
    if (moim.can.close) {
      items.push({ key: "close", label: t("moim_manage_close_title"), danger: true, onClick: () => router.push(moimRoutes.manageClose(moim.id)) });
    }
  } else if (isMember) {
    items.push({ key: "leave", label: t("moim_menu_leave"), danger: true, onClick: () => void leave() });
  }

  return (
    <>
      {moim.viewer.incomingHostTransferId ? (
        <div className={moimCls.column}>
          <HostTransferBanner transferId={moim.viewer.incomingHostTransferId} moim={moim} onDone={reload} onToast={toast.show} />
        </div>
      ) : null}
      {isMember ? (
        <MoimMemberView
          moim={moim}
          onReport={setReport}
          onToast={toast.show}
          primaryCtaTaken={!!moim.viewer.incomingHostTransferId}
        />
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
      <MoimReportSheet moimId={moim.id} reasons={moim.reportReasons} target={report} onClose={() => setReport(null)} onDone={(m) => toast.show(m, "success")} />
      {toast.node}
    </>
  );
}
