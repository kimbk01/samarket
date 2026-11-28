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
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  MoimRoleBadge,
  moimManageCardClass,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

/** 위임 요청 버튼을 그리지 않는 조건 — 경고 받은 모임 · 위임 권한 없음 · 이미 보냄 (R3 U-16) */
export function transferButtonHidden(x: { warned: boolean; canTransfer: boolean; sentTo: string | null }): boolean {
  return x.warned || !x.canTransfer || x.sentTo != null;
}

function TransferBody({ detail }: { detail: MoimDetailDto }) {
  const { t } = useI18n();
  const toast = useMoimManageToast();
  const warned = detail.platformState === "warned";
  const load = useCallback(() => moimApi.members(detail.id), [detail.id]);
  const { state, reload } = useMoimResource(load);
  const [selected, setSelected] = useState<MoimMemberDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const send = async () => {
    if (!selected) return;
    setBusy(true);
    const r = await moimApi.requestHostTransfer(detail.id, selected.userId);
    setBusy(false);
    setConfirmOpen(false);
    if (!r.ok) return toast.showError(r.error);
    setSentTo(selected.nickname);
    toast.show(t("moim_manage_transfer_sent_toast"), "success");
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
      {sentTo ? (
        <p className="mt-3 rounded-ui-rect bg-sam-success-soft px-3 py-2.5 text-[13px] text-sam-fg" role="status">
          {t("moim_manage_transfer_sent_notice", { name: sentTo })}
        </p>
      ) : null}

      {state.status === "loading" ? <MoimManageLoading /> : null}
      {state.status === "error" ? <MoimManageError errorKey={state.errorKey} onRetry={reload} /> : null}
      {state.status === "ready" ? (
        (() => {
          const candidates = state.data.members.filter((m) => m.role !== "host");
          if (candidates.length === 0) return <MoimManageEmpty textKey="moim_manage_transfer_empty" />;
          return (
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
      {toast.node}
    </div>
  );
}

export function MoimManageTransfer({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_transfer_title" stickyFooter allow={canOpenMoimTransfer}>
      {({ detail }) => <TransferBody detail={detail} />}
    </MoimManageFrame>
  );
}
