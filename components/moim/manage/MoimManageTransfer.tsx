"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto, MoimMemberDto } from "@/lib/moim/moim-api-types";
import { moimCls } from "@/components/moim/moim-ui";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";
import { canOpenMoimTransfer } from "./MoimManageHub";
import {
  MoimAvatar,
  MoimPeopleCappedHint,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  MoimRoleBadge,
  moimManageCardClass,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

/** 위임 요청 버튼을 그리지 않는 조건 — 경고 받은 모임 · 위임 권한 없음 · 이미 보냄 (R3 U-16 · R5 C5: 보낸 요청 = 서버 값) */
export function transferButtonHidden(x: { warned: boolean; canTransfer: boolean; sentTo: string | null }): boolean {
  return x.warned || !x.canTransfer || x.sentTo != null;
}

function TransferBody({ detail, reloadDetail }: { detail: MoimDetailDto; reloadDetail: () => void }) {
  const { t } = useI18n();
  const toast = useMoimManageToast();
  const fmt = useMoimDateFormat();
  /** R5 C5: 내가 보낸 직접 위임 요청 — 화면을 나갔다 와도 유지(서버 값). 있으면 후보 선택·보내기 대신 취소 카드 */
  const outgoing = detail.viewer.outgoingHostTransfer;
  const [cancelOpen, setCancelOpen] = useState(false);
  const warned = detail.platformState === "warned";
  const load = useCallback(() => moimApi.members(detail.id), [detail.id]);
  const { state, reload } = useMoimResource(load);
  const [selected, setSelected] = useState<MoimMemberDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sentTo = outgoing ? outgoing.toNickname : null;

  const send = async () => {
    if (!selected) return;
    setBusy(true);
    const r = await moimApi.requestHostTransfer(detail.id, selected.userId);
    setBusy(false);
    setConfirmOpen(false);
    if (!r.ok) {
      toast.showError(r.error);
      /** 이미 열린 요청이 있음 → 서버 값을 다시 읽어 그 요청 카드를 보인다 */
      if (r.error === "moim_transfer_pending") reloadDetail();
      return;
    }
    toast.show(t("moim_manage_transfer_sent_toast"), "success");
    reloadDetail();
  };

  const cancel = async () => {
    if (!outgoing) return;
    setBusy(true);
    const r = await moimApi.cancelHostTransfer(outgoing.id);
    setBusy(false);
    setCancelOpen(false);
    if (!r.ok) {
      toast.showError(r.error);
      if (r.error === "moim_transfer_not_found") reloadDetail();
      return;
    }
    toast.show(t("moim_manage_transfer_cancelled_toast"), "success");
    reloadDetail();
  };

  return (
    <div className="px-4 pt-4">
      <div className={`${moimManageCardClass} p-4`}>
        <p className="text-[14px] text-sam-fg">{t("moim_manage_transfer_intro")}</p>
        <p className="mt-1.5 text-[13px] text-sam-muted">{t("moim_manage_transfer_after")}</p>
      </div>
      {warned ? (
        <p className="mt-3 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2.5 text-[13px] text-sam-fg" role="alert">
          {t("moim_err_moim_transfer_blocked_by_warning")}
        </p>
      ) : null}
      {outgoing ? (
        <div className={`${moimManageCardClass} mt-3 grid gap-2 p-4`} role="status" data-testid="moim-transfer-outgoing">
          <p className="text-[14px] text-sam-fg">
            {t("moim_manage_transfer_pending_notice", { name: outgoing.toNickname, date: fmt(outgoing.createdAt) })}
          </p>
          <button type="button" disabled={busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={() => setCancelOpen(true)}>
            {t("moim_manage_transfer_cancel_btn")}
          </button>
        </div>
      ) : null}

      {outgoing ? null : state.status === "loading" ? <MoimManageLoading /> : null}
      {state.status === "error" ? <MoimManageError errorKey={state.errorKey} onRetry={reload} /> : null}
      {!outgoing && state.status === "ready" ? (
        (() => {
          const candidates = state.data.members.filter((m) => m.role !== "host");
          if (candidates.length === 0) return <MoimManageEmpty textKey="moim_manage_transfer_empty" />;
          return (
            <>
            <MoimPeopleCappedHint show={state.data.capped} />
            <ul className={`${moimManageCardClass} mt-4 divide-y divide-sam-border-soft`} role="radiogroup">
              {candidates.map((m) => (
                <li key={m.userId}>
                  <label className={`flex min-h-[56px] items-center gap-3 px-3 py-2 ${warned ? "" : "cursor-pointer"}`}>
                    <input
                      type="radio"
                      name="moim-transfer-to"
                      className="h-4 w-4 shrink-0 accent-[color:var(--sam-primary)]"
                      disabled={warned || sentTo != null}
                      checked={selected?.userId === m.userId}
                      onChange={() => setSelected(m)}
                    />
                    <MoimAvatar url={m.avatarUrl} name={m.nickname} size={36} />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span className="break-all text-[15px] text-sam-fg">{m.nickname}</span>
                      <MoimRoleBadge role={m.role} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            </>
          );
        })()
      ) : null}

      {/* R3 U-16 G-dis-03: 경고·권한 없음이면 막힌 버튼 대신 위 안내 줄만 · 보낸 뒤에는 다시 보내지 않게 숨김 (HostRequest `sent` 와 같게) */}
      {!transferButtonHidden({ warned, canTransfer: detail.can.transfer_host, sentTo }) ? (
        <MoimStickyFooter className="-mx-4 mt-4">
          <div className={moimCls.column}>
            <button
              type="button"
              disabled={!selected || busy}
              className={`${moimCls.btnPrimary} w-full`}
              onClick={() => setConfirmOpen(true)}
            >
              {t("moim_manage_transfer_request_btn")}
            </button>
          </div>
        </MoimStickyFooter>
      ) : null}

      <DibayConfirmDialog
        open={confirmOpen && selected != null}
        title={t("moim_manage_transfer_confirm_title", { name: selected?.nickname ?? "" })}
        description={t("moim_manage_transfer_confirm_body")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_transfer_request_btn")}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void send()}
      />
      <DibayConfirmDialog
        open={cancelOpen && outgoing != null}
        title={t("moim_manage_transfer_cancel_confirm_title")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_transfer_cancel_btn")}
        confirmTone="destructive"
        busy={busy}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => void cancel()}
      />
      {toast.node}
    </div>
  );
}

export function MoimManageTransfer({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_transfer_title" stickyFooter allow={canOpenMoimTransfer}>
      {({ detail, reload }) => <TransferBody detail={detail} reloadDetail={reload} />}
    </MoimManageFrame>
  );
}
