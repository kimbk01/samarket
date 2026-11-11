"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayActions } from "@/components/ui/dibay-overlay";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimJoinRequestDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  MoimAvatar,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  moimManageCardClass,
  moimManageTextareaClass,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

function RequestsBody({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const fmt = useMoimDateFormat();
  const toast = useMoimManageToast();
  const load = useCallback(() => moimApi.joinRequests(moimId), [moimId]);
  const { state, reload } = useMoimResource(load);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MoimJoinRequestDto | null>(null);
  const [reason, setReason] = useState("");

  const decide = useCallback(
    async (req: MoimJoinRequestDto, approve: boolean, why?: string) => {
      setBusyId(req.id);
      const r = await moimApi.decideJoin(moimId, req.id, approve, why?.trim() ? why.trim() : null);
      setBusyId(null);
      if (!r.ok) {
        toast.showError(r.error);
        if (r.error === "moim_request_not_found") reload();
        return false;
      }
      setDone((prev) => new Set(prev).add(req.id));
      toast.show(t(approve ? "moim_manage_approved_toast" : "moim_manage_rejected_toast"), "success");
      return true;
    },
    [moimId, reload, t, toast]
  );

  if (state.status === "loading") return <MoimManageLoading />;
  if (state.status === "error") return <MoimManageError errorKey={state.errorKey} onRetry={reload} />;
  const list = state.data.requests.filter((r) => !done.has(r.id));

  return (
    <>
      {list.length === 0 ? <MoimManageEmpty textKey="moim_manage_requests_empty" /> : null}
      <ul className="flex flex-col gap-3 px-4 pt-4">
        {list.map((req) => (
          <li key={req.id} className={`${moimManageCardClass} p-4`}>
            <div className="flex items-start gap-3">
              <MoimAvatar url={req.avatarUrl} name={req.nickname} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="break-all text-[15px] font-semibold text-sam-fg">{req.nickname}</span>
                  {req.rejoinCount > 0 ? (
                    <span className={`${Sam.badge.neutral} whitespace-nowrap`}>{t("moim_manage_rejoin_badge", { count: req.rejoinCount })}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[12px] text-sam-meta">{t("moim_manage_requested_at", { date: fmt(req.createdAt) })}</p>
                {req.bio ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{req.bio}</p> : null}
              </div>
            </div>
            {req.answers.length > 0 ? (
              <dl className="mt-3 flex flex-col gap-2 rounded-ui-rect bg-sam-surface-muted p-3">
                {req.answers.map((a, i) => (
                  <div key={i}>
                    <dt className="text-[13px] font-medium text-sam-muted">{a.question}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{a.answer}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busyId === req.id}
                className={`${Sam.btn.secondaryCombo} ${Sam.btn.disabledToken} flex-1 rounded-ui-rect`}
                onClick={() => {
                  setReason("");
                  setRejectTarget(req);
                }}
              >
                {t("moim_manage_reject_btn")}
              </button>
              <button
                type="button"
                disabled={busyId === req.id}
                className={`${Sam.btn.primaryCombo} ${Sam.btn.disabledToken} flex-1 rounded-ui-rect`}
                onClick={() => void decide(req, true)}
              >
                {t("moim_manage_approve_btn")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <DibayBottomSheet
        open={rejectTarget != null}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? t("moim_manage_reject_sheet_title", { name: rejectTarget.nickname }) : ""}
        footer={
          <DibayOverlayActions
            actions={[
              { key: "cancel", label: t("moim_manage_cancel_btn"), roleTone: "secondary", onClick: () => setRejectTarget(null) },
              {
                key: "reject",
                label: t("moim_manage_reject_btn"),
                roleTone: "destructive",
                loading: rejectTarget != null && busyId === rejectTarget.id,
                onClick: () => {
                  const target = rejectTarget;
                  if (!target) return;
                  void decide(target, false, reason).then((ok) => {
                    if (ok) setRejectTarget(null);
                  });
                },
              },
            ]}
          />
        }
      >
        <label className="block text-[13px] font-medium text-sam-muted" htmlFor="moim-reject-reason">
          {t("moim_manage_reason_optional_label")}
        </label>
        <textarea
          id="moim-reject-reason"
          className={`${moimManageTextareaClass} mt-1.5 min-h-[96px]`}
          maxLength={300}
          value={reason}
          placeholder={t("moim_manage_reject_reason_placeholder")}
          onChange={(e) => setReason(e.target.value)}
        />
      </DibayBottomSheet>
      {toast.node}
    </>
  );
}

export function MoimManageRequests({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_requests_title" allow={(d) => d.can.decide_join}>
      {() => <RequestsBody moimId={moimId} />}
    </MoimManageFrame>
  );
}
