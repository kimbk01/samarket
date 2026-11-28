"use client";

import { useMoimNotificationRead } from "@/lib/moim/use-moim-notification-read";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayActions } from "@/components/ui/dibay-overlay";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import { MOIM_LIST_CAP, type MoimJoinRequestDto } from "@/lib/moim/moim-api-types";
import { moimCls } from "@/components/moim/moim-ui";
import {
  MoimAvatar,
  MoimPeopleCappedHint,
  MoimManageEmpty,
  MoimManageError,
  MoimManageFrame,
  MoimManageLoading,
  moimManageCardClass,
  moimManageSheetTextareaClass,
  useMoimDateFormat,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

/** 가입 사유 상한 — 라우트 `slice(0,100)` 과 같은 값 (R5 C11) */
const REJECT_REASON_MAX = 100;

/** R5 C22: 멤버 관리에서 들어왔으면(`?from=members`) 뒤로 = 멤버 관리. 다른 값은 무시한다(바깥 주소로 못 가게 고정 값만) */
export function moimRequestsBackHref(moimId: string, from: string | null | undefined): string | undefined {
  return from === "members" ? moimRoutes.manageMembers(moimId) : undefined;
}

function RequestsBody({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const fmt = useMoimDateFormat();
  const toast = useMoimManageToast();
  const load = useCallback(() => moimApi.joinRequests(moimId), [moimId]);
  const { state, reload } = useMoimResource(load);
  /** R2 N-06: 이 화면으로 가는 모임 알림 읽음 (정책 §2) */
  useMoimNotificationRead(`/moim/${moimId}/manage/requests`, state.status !== "loading");
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
      <MoimPeopleCappedHint show={state.data.capped} cap={MOIM_LIST_CAP} />
      <ul className="flex flex-col gap-3 px-4 pt-4">
        {list.map((req) => (
          <li key={req.id} className={`${moimManageCardClass} p-4`}>
            <div className="flex items-start gap-3">
              <MoimAvatar url={req.avatarUrl} name={req.nickname} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="break-all text-[15px] font-semibold text-sam-fg">{req.nickname}</span>
                  {req.rejoinCount > 0 ? (
                    <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_manage_rejoin_badge", { count: req.rejoinCount })}</span>
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
                className={`${moimCls.btnDanger} flex-1`}
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
                className={`${moimCls.btnSecondary} flex-1`}
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
          className={`${moimManageSheetTextareaClass} mt-1.5 min-h-[96px]`}
          maxLength={REJECT_REASON_MAX}
          value={reason}
          placeholder={t("moim_manage_reject_reason_placeholder")}
          onChange={(e) => setReason(e.target.value)}
        />
        {/* R5 C11: 사유는 신청자에게 알림으로 간다 · 100자까지 */}
        <div className="mt-1 flex items-start justify-between gap-2 text-[12px] text-sam-meta">
          <span>{t("moim_manage_reject_reason_hint")}</span>
          <span className="shrink-0">{t("moim_manage_char_count", { count: reason.length, max: REJECT_REASON_MAX })}</span>
        </div>
      </DibayBottomSheet>
      {toast.node}
    </>
  );
}

export function MoimManageRequests({ moimId }: { moimId: string }) {
  const from = useSearchParams()?.get("from");
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_requests_title" backHref={moimRequestsBackHref(moimId, from)} allow={(d) => d.can.decide_join}>
      {() => <RequestsBody moimId={moimId} />}
    </MoimManageFrame>
  );
}
