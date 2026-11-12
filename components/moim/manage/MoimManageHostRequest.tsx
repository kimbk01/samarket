"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto, MoimMemberDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import { canRequestMoimHostChange } from "./MoimManageHub";
import {
  MoimAvatar,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  MoimRoleBadge,
  moimManageCardClass,
  moimManageTextareaClass,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

/**
 * P8 미접속 모임장 변경 요청 (설계 §6 P8) — 부모임장·운영진.
 * 모임장이 30일 이상 접속하지 않았을 때 후보 멤버를 골라 운영팀에 요청한다. 운영팀이 확인하고 지정한다(자동 위임 없음).
 */
function HostRequestBody({ detail }: { detail: MoimDetailDto }) {
  const { t } = useI18n();
  const toast = useMoimManageToast();
  const load = useCallback(() => moimApi.members(detail.id), [detail.id]);
  const { state, reload } = useMoimResource(load);
  const [selected, setSelected] = useState<MoimMemberDto | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const send = async () => {
    if (!selected) return;
    setBusy(true);
    setErrorText(null);
    const r = await moimApi.requestInactiveHostChange(detail.id, selected.userId, reason.trim() || null);
    setBusy(false);
    setConfirmOpen(false);
    if (!r.ok) {
      if (r.error === "moim_host_recently_active" || r.error === "moim_transfer_pending") {
        setErrorText(t(r.error === "moim_host_recently_active" ? "moim_err_moim_host_recently_active" : "moim_err_moim_transfer_pending"));
        return;
      }
      toast.showError(r.error);
      return;
    }
    setSent(true);
    toast.show(t("moim_manage_host_request_sent_toast"), "success");
  };

  return (
    <div className="px-4 pb-6 pt-4">
      <div className={`${moimManageCardClass} p-4`}>
        <p className="text-[14px] text-sam-fg">{t("moim_manage_host_request_intro")}</p>
        <p className="mt-1.5 text-[13px] text-sam-muted">{t("moim_manage_host_request_after")}</p>
      </div>
      {errorText ? (
        <p className="mt-3 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2.5 text-[13px] text-sam-fg" role="alert">
          {errorText}
        </p>
      ) : null}
      {sent ? (
        <p className="mt-3 rounded-ui-rect bg-sam-success-soft px-3 py-2.5 text-[13px] text-sam-fg" role="status">
          {t("moim_manage_host_request_sent_notice")}
        </p>
      ) : null}

      {state.status === "loading" ? <MoimManageLoading /> : null}
      {state.status === "error" ? <MoimManageError errorKey={state.errorKey} onRetry={reload} /> : null}
      {state.status === "ready" ? (
        (() => {
          const candidates = state.data.members.filter((m) => m.role !== "host");
          if (candidates.length === 0) return <MoimManageEmpty textKey="moim_manage_host_request_empty" />;
          return (
            <ul className={`${moimManageCardClass} mt-4 divide-y divide-sam-border-soft`} role="radiogroup" aria-label={t("moim_manage_host_request_pick")}>
              {candidates.map((m) => (
                <li key={m.userId}>
                  <label className={`flex min-h-[56px] items-center gap-3 px-3 py-2 ${sent ? "" : "cursor-pointer"}`}>
                    <input
                      type="radio"
                      name="moim-host-request-to"
                      className="h-4 w-4 shrink-0 accent-[color:var(--sam-primary)]"
                      disabled={sent}
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

      <label className="mt-4 block text-[14px] font-medium text-sam-fg" htmlFor="moim-host-request-reason">
        {t("moim_manage_host_request_reason_label")}
      </label>
      <textarea
        id="moim-host-request-reason"
        className={`${moimManageTextareaClass} mt-1.5 min-h-[88px]`}
        maxLength={500}
        value={reason}
        disabled={sent}
        placeholder={t("moim_manage_host_request_reason_placeholder")}
        onChange={(e) => setReason(e.target.value)}
      />

      <button
        type="button"
        disabled={!selected || busy || sent}
        className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.btn.disabledToken} mt-4 rounded-ui-rect`}
        onClick={() => setConfirmOpen(true)}
      >
        {t("moim_manage_host_request_btn")}
      </button>

      <DibayConfirmDialog
        open={confirmOpen && selected != null}
        title={t("moim_manage_host_request_confirm_title", { name: selected?.nickname ?? "" })}
        description={t("moim_manage_host_request_confirm_body")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_host_request_btn")}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void send()}
      />
      {toast.node}
    </div>
  );
}

export function MoimManageHostRequest({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_host_request_title" allow={canRequestMoimHostChange}>
      {({ detail }) => <HostRequestBody detail={detail} />}
    </MoimManageFrame>
  );
}
