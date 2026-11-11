"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, PenSquare } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet, dibayConfirm } from "@/components/ui/dibay-overlay";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto, MoimScheduleDto, MoimScheduleParticipantDto } from "@/lib/moim/moim-api-types";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { canWriteMoimBoard } from "@/components/moim/MoimMemberView";
import { MoimReportSheet, type MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { MoimScheduleAlbumSection } from "@/components/moim/MoimAlbum";
import {
  MoimScheduleMyBadge,
  MoimScheduleStatusBadge,
  formatMoimScheduleCount,
  formatMoimScheduleWhen,
  moimScheduleStarted,
} from "@/components/moim/moim-schedule-ui";
import { MoimAvatar, MoimEmptyState, MoimErrorState, MoimListSkeleton, MoimRoleBadge, moimCls, useMoimToast } from "@/components/moim/moim-ui";

const MOTIVATION_MIN = 8;
const MOTIVATION_MAX = 500;

type Toast = (message: string, tone?: "default" | "success" | "error") => void;

function useMoimSchedule(scheduleId: string) {
  const [data, setData] = useState<{ schedule: MoimScheduleDto; participants: MoimScheduleParticipantDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    void moimApi.schedule(scheduleId).then((r) => {
      if (!alive) return;
      if (r.ok) setData({ schedule: r.schedule, participants: r.participants });
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [scheduleId, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { data, setData, error, reload };
}

/** 정보 한 줄 — 일시 · 장소 · 인원 · 호스트 */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-[14px]">
      <span className="w-14 shrink-0 text-sam-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sam-fg">{children}</span>
    </div>
  );
}

/** 지원 동기 시트 (8자 이상) */
function MotivationSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (text: string) => Promise<string | null> }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
    }
  }, [open]);
  const len = [...text.trim()].length;
  const submit = async () => {
    if (busy) return;
    if (len < MOTIVATION_MIN) {
      setError(t(moimErrorKey("moim_schedule_motivation_required")));
      return;
    }
    setBusy(true);
    const e = await onSubmit(text.trim());
    setBusy(false);
    if (e) setError(e);
  };
  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      preferredHeightRatio={null}
      header={<DibaySheetHeader title={t("moim_schedule_motivation_title")} onClose={onClose} closeLabel={t("common_close")} />}
      footer={
        <div className="px-4 pb-3 pt-2">
          <button type="button" className={`${moimCls.btnPrimary} w-full`} disabled={busy || len === 0} onClick={submit}>
            {t("moim_schedule_request_btn")}
          </button>
        </div>
      }
    >
      <div className="grid gap-2 px-4 pb-2">
        <p className={moimCls.hint}>{t("moim_schedule_motivation_lead", { min: MOTIVATION_MIN })}</p>
        <textarea
          className={`${moimCls.textarea} min-h-[110px]`}
          value={text}
          maxLength={MOTIVATION_MAX}
          placeholder={t("moim_schedule_motivation_placeholder")}
          onChange={(e) => setText(e.target.value)}
        />
        <span className={`${moimCls.hint} text-right`}>
          {len}/{MOTIVATION_MAX}
        </span>
        {error ? <p className={moimCls.noticeBad}>{error}</p> : null}
      </div>
    </DibayUsableAreaSheet>
  );
}

/** 일정 상세 (시안 U5) /moim/[id]/schedules/[sid] */
export function MoimScheduleDetailScreen({ moimId, scheduleId }: { moimId: string; scheduleId: string }) {
  const { t } = useI18n();
  const toast = useMoimToast();
  const { moim, error: moimError, reload: reloadMoim } = useMoimDetail(moimId);
  const { data, setData, error, reload } = useMoimSchedule(scheduleId);
  const [report, setReport] = useState<MoimReportTarget | null>(null);

  const header = useMemo(() => ({ titleText: t("moim_schedule_title"), backHref: moimRoutes.schedules(moimId) }), [moimId, t]);
  useRegisterMainTier1Header(header);

  const err = moimError ?? error;
  if (err) {
    return (
      <div className={moimCls.page}>
        <MoimErrorState
          messageKey={moimErrorKey(err)}
          onRetry={
            err === "moim_not_found" || err === "moim_schedule_not_found"
              ? undefined
              : () => {
                  reloadMoim();
                  reload();
                }
          }
        />
      </div>
    );
  }
  if (!moim || !data) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={3} />
      </div>
    );
  }
  if (moim.viewer.status !== "active") {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_err_moim_not_member")}</MoimEmptyState>
      </div>
    );
  }

  return (
    <>
      <ScheduleBody
        moim={moim}
        schedule={data.schedule}
        participants={data.participants}
        onReload={reload}
        onParticipants={(participants) => setData((d) => (d ? { ...d, participants } : d))}
        onReport={setReport}
        onToast={toast.show}
      />
      <MoimReportSheet moimId={moim.id} target={report} onClose={() => setReport(null)} onDone={(m) => toast.show(m, "success")} />
      {toast.node}
    </>
  );
}

function ScheduleBody({
  moim,
  schedule: s,
  participants,
  onReload,
  onParticipants,
  onReport,
  onToast,
}: {
  moim: MoimDetailDto;
  schedule: MoimScheduleDto;
  participants: MoimScheduleParticipantDto[];
  onReload: () => void;
  onParticipants: (p: MoimScheduleParticipantDto[]) => void;
  onReport: (target: MoimReportTarget) => void;
  onToast: Toast;
}) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  const [motivationOpen, setMotivationOpen] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setMyId(getHydrationSafeCurrentUser()?.id ?? null), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const started = moimScheduleStarted(s, now);
  const finished = s.status === "done" || s.status === "cancelled";
  const live = !finished && moim.status === "active" && moim.platformState !== "blocked";
  const confirmed = participants.filter((p) => p.status === "confirmed");
  const requested = participants.filter((p) => p.status === "requested");
  const my = s.viewer.status;
  const manage = s.viewer.canManage && live;
  const reviewBoard = moim.boards.find((b) => b.kind === "review" && canWriteMoimBoard(moim, b)) ?? null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    if (busy) return false;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      onToast(t(moimErrorKey((r as { error?: string }).error)), "error");
      return false;
    }
    onToast(okMsg, "success");
    onReload();
    return true;
  };

  const join = async () => {
    if (s.joinMode === "approval" && s.askMotivation) {
      setMotivationOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const r = await moimApi.joinSchedule(s.id, null);
    setBusy(false);
    if (!r.ok) return onToast(t(moimErrorKey(r.error)), "error");
    onToast(r.status === "confirmed" ? t("moim_schedule_joined_toast") : t("moim_schedule_requested_toast"), "success");
    onReload();
  };

  const submitMotivation = async (text: string) => {
    const r = await moimApi.joinSchedule(s.id, text);
    if (!r.ok) return t(moimErrorKey(r.error));
    setMotivationOpen(false);
    onToast(r.status === "confirmed" ? t("moim_schedule_joined_toast") : t("moim_schedule_requested_toast"), "success");
    onReload();
    return null;
  };

  const leave = async () => {
    const isRequest = my === "requested";
    const ok = await dibayConfirm({
      title: isRequest ? t("moim_schedule_cancel_request_confirm_title") : t("moim_schedule_leave_confirm_title"),
      confirmLabel: isRequest ? t("moim_schedule_cancel_request_btn") : t("moim_schedule_leave_btn"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    await run(() => moimApi.leaveSchedule(s.id), isRequest ? t("moim_schedule_request_cancelled_toast") : t("moim_schedule_left_toast"));
  };

  const cancelSchedule = async () => {
    const ok = await dibayConfirm({
      title: t("moim_schedule_cancel_confirm_title"),
      description: t("moim_schedule_cancel_confirm_body"),
      confirmLabel: t("moim_schedule_cancel_btn"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    await run(() => moimApi.cancelSchedule(s.id), t("moim_schedule_cancelled_toast"));
  };

  const toggleClosed = async () => {
    const closing = s.status !== "closed";
    await run(() => moimApi.setScheduleClosed(s.id, closing), closing ? t("moim_schedule_closed_toast") : t("moim_schedule_reopened_toast"));
  };

  const decide = async (p: MoimScheduleParticipantDto, action: "approve" | "reject") => {
    await run(
      () => moimApi.decideScheduleParticipant(s.id, p.userId, action),
      action === "approve" ? t("moim_schedule_approved_toast") : t("moim_schedule_rejected_toast")
    );
  };

  const removeParticipant = async (p: MoimScheduleParticipantDto) => {
    const ok = await dibayConfirm({
      title: t("moim_schedule_remove_confirm_title", { name: p.nickname }),
      description: t("moim_schedule_remove_confirm_body"),
      confirmLabel: t("moim_schedule_remove_btn"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    await run(() => moimApi.decideScheduleParticipant(s.id, p.userId, "remove"), t("moim_schedule_removed_toast"));
  };

  /** 출석 — 같은 값을 다시 누르면 「모름」으로 되돌린다 (낙관 반영 + 실패 시 원위치) */
  const setAttendance = async (p: MoimScheduleParticipantDto, value: "present" | "absent") => {
    const next = p.attendance === value ? "unknown" : value;
    const before = participants;
    onParticipants(participants.map((x) => (x.userId === p.userId ? { ...x, attendance: next } : x)));
    const r = await moimApi.setAttendance(s.id, p.userId, next);
    if (!r.ok) {
      onParticipants(before);
      onToast(t(moimErrorKey(r.error)), "error");
    }
  };

  // 참여 버튼 영역
  let cta: React.ReactNode = null;
  if (live) {
    if (my === "confirmed") {
      cta = s.viewer.isHost ? (
        manage ? (
          <button type="button" disabled={busy} className={`${moimCls.btnSecondary} w-full`} onClick={cancelSchedule}>
            {t("moim_schedule_cancel_btn")}
          </button>
        ) : null
      ) : !started ? (
        <button type="button" disabled={busy} className={`${moimCls.btnSecondary} w-full`} onClick={leave}>
          {t("moim_schedule_leave_btn")}
        </button>
      ) : null;
    } else if (my === "requested") {
      cta = (
        <div className="grid gap-2">
          <p className="text-center text-[13px] text-sam-muted">{t("moim_schedule_request_pending_note")}</p>
          <button type="button" disabled={busy} className={`${moimCls.btnSecondary} w-full`} onClick={leave}>
            {t("moim_schedule_cancel_request_btn")}
          </button>
        </div>
      );
    } else if (my === "removed") {
      cta = <p className="text-center text-[13px] text-sam-muted">{t("moim_schedule_removed_note")}</p>;
    } else if (started) {
      cta = (
        <button type="button" disabled className={`${moimCls.btnPrimary} w-full`}>
          {t("moim_schedule_started_btn")}
        </button>
      );
    } else if (s.status === "full") {
      cta = (
        <button type="button" disabled className={`${moimCls.btnPrimary} w-full`}>
          {t("moim_schedule_full_btn")}
        </button>
      );
    } else if (s.status === "closed") {
      cta = (
        <button type="button" disabled className={`${moimCls.btnPrimary} w-full`}>
          {t("moim_schedule_closed_btn")}
        </button>
      );
    } else {
      cta = (
        <div className="grid gap-2">
          <p className="text-center text-[12px] text-sam-muted">{t("moim_schedule_room_note")}</p>
          <button type="button" disabled={busy} className={`${moimCls.btnPrimary} w-full`} onClick={join}>
            {s.joinMode === "approval" ? t("moim_schedule_request_btn") : t("moim_schedule_join_btn")}
          </button>
        </div>
      );
    }
  }

  // 출석은 시작 뒤 · 끝난 일정도 체크 가능 (설계 P10 「종료 후」), 취소 일정은 제외
  const showAttendance =
    s.viewer.canManage && started && s.status !== "cancelled" && moim.status === "active" && moim.platformState !== "blocked";
  const canClose = manage && !started && (s.status === "recruiting" || s.status === "full" || s.status === "closed");

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <div className={`${moimCls.column} flex-1 pb-6`}>
        <div className="border-b border-sam-border bg-sam-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <MoimScheduleStatusBadge status={s.status} />
            <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>
              {s.joinMode === "approval" ? t("moim_schedule_approval_badge") : t("moim_schedule_first_come_badge")}
            </span>
            <MoimScheduleMyBadge status={my} />
          </div>
          <h1 className="mt-1.5 break-words text-[18px] font-bold text-sam-fg">{s.title}</h1>
          <div className="mt-2">
            <InfoRow label={t("moim_schedule_when_label")}>
              {formatMoimScheduleWhen(s.startsAt, language)}
              {s.endsAt ? ` – ${formatMoimScheduleWhen(s.endsAt, language)}` : ""}
            </InfoRow>
            {s.placeText ? <InfoRow label={t("moim_schedule_place_label")}>{s.placeText}</InfoRow> : null}
            <InfoRow label={t("moim_schedule_people_label")}>{formatMoimScheduleCount(s.confirmedCount, s.capacity, t)}</InfoRow>
            <InfoRow label={t("moim_schedule_host_label")}>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {s.host.nickname}
                <MoimRoleBadge role={s.host.role} />
              </span>
            </InfoRow>
          </div>
          {s.description ? <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{s.description}</p> : null}
          {s.images.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {s.images.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${u}-${i}`} src={u} alt="" className="w-full rounded-ui-rect bg-sam-surface-muted object-cover" />
              ))}
            </div>
          ) : null}
        </div>

        {s.status === "cancelled" ? <p className={`${moimCls.noticeBad} mx-4 mt-3`}>{t("moim_schedule_cancelled_notice")}</p> : null}
        {s.status === "done" ? <p className={`${moimCls.noticeInfo} mx-4 mt-3`}>{t("moim_schedule_done_notice")}</p> : null}

        {s.viewer.roomId ? (
          <div className="px-4 pt-3">
            <Link href={buildGroupRoomWebPath(s.viewer.roomId)} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full gap-1.5`}>
              <MessageCircle className="h-4 w-4" aria-hidden />
              {t("moim_schedule_chat_btn")}
            </Link>
          </div>
        ) : null}

        {s.status === "done" && reviewBoard && my === "confirmed" ? (
          <div className="px-4 pt-3">
            <Link href={moimRoutes.write(moim.id, reviewBoard.id)} className={`${moimCls.btnPrimary} ${moimCls.btnSm} w-full gap-1.5`}>
              <PenSquare className="h-4 w-4" aria-hidden />
              {t("moim_schedule_review_btn")}
            </Link>
          </div>
        ) : null}

        {manage && requested.length > 0 ? (
          <section>
            <div className={moimCls.sectionHead}>
              <h2 className={moimCls.sectionTitle}>{t("moim_schedule_requests_title", { count: requested.length })}</h2>
            </div>
            <div className="grid gap-2 px-4">
              {requested.map((p) => (
                <div key={p.userId} className={`${moimCls.card} grid gap-2 p-3`}>
                  <div className="flex items-center gap-2">
                    <MoimAvatar url={p.avatarUrl} name={p.nickname} size={32} />
                    <b className="min-w-0 flex-1 break-words text-[14px] text-sam-fg">{p.nickname}</b>
                    <MoimRoleBadge role={p.role} />
                  </div>
                  {p.motivation ? (
                    <p className="whitespace-pre-wrap break-words rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[13px] text-sam-fg">{p.motivation}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} flex-1`} onClick={() => decide(p, "reject")}>
                      {t("common_reject")}
                    </button>
                    <button type="button" disabled={busy} className={`${moimCls.btnPrimary} ${moimCls.btnSm} flex-1`} onClick={() => decide(p, "approve")}>
                      {t("moim_schedule_approve_btn")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className={moimCls.sectionHead}>
            <h2 className={moimCls.sectionTitle}>{t("moim_schedule_confirmed_title", { count: confirmed.length })}</h2>
          </div>
          {confirmed.length === 0 ? (
            <p className="px-4 text-[13px] text-sam-muted">{t("moim_schedule_confirmed_empty")}</p>
          ) : (
            <>
              <div className={`${moimCls.hScroll} pb-2`}>
                {confirmed.slice(0, 12).map((p) => (
                  <MoimAvatar key={p.userId} url={p.avatarUrl} name={p.nickname} size={36} />
                ))}
              </div>
              <div>
                {confirmed.map((p) => {
                  const isHost = p.userId === s.host.userId;
                  const self = p.userId === myId;
                  return (
                    <div key={p.userId} className="flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-4 py-2.5">
                      <MoimAvatar url={p.avatarUrl} name={p.nickname} size={32} />
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <b className="break-words text-[14px] text-sam-fg">{p.nickname}</b>
                        {isHost ? <span className={`${moimCls.badge} ${moimCls.badgeGreen}`}>{t("moim_schedule_host_badge")}</span> : <MoimRoleBadge role={p.role} />}
                        {self ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_members_me_badge")}</span> : null}
                      </span>
                      {showAttendance ? (
                        <span className="flex shrink-0 overflow-hidden rounded-ui-rect border border-sam-border" role="group" aria-label={t("moim_schedule_attendance_aria")}>
                          {(["present", "absent"] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              aria-pressed={p.attendance === v}
                              className={`px-2.5 py-1 text-[12px] ${
                                p.attendance === v
                                  ? v === "present"
                                    ? "bg-sam-primary font-bold text-sam-on-primary"
                                    : "bg-sam-danger-soft font-bold text-sam-danger"
                                  : "bg-sam-surface text-sam-fg"
                              }`}
                              onClick={() => void setAttendance(p, v)}
                            >
                              {v === "present" ? t("moim_schedule_present_segment") : t("moim_schedule_absent_segment")}
                            </button>
                          ))}
                        </span>
                      ) : null}
                      {manage && !started && !isHost && !self ? (
                        <button type="button" disabled={busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} shrink-0`} onClick={() => removeParticipant(p)}>
                          {t("moim_schedule_remove_btn")}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {manage ? (
          <section>
            <div className={moimCls.sectionHead}>
              <h2 className={moimCls.sectionTitle}>{t("moim_schedule_manage_title")}</h2>
            </div>
            <div className="grid gap-2 px-4">
              {!started ? (
                <Link href={moimRoutes.scheduleEdit(moim.id, s.id)} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`}>
                  {t("moim_schedule_edit_btn")}
                </Link>
              ) : null}
              {canClose ? (
                <button type="button" disabled={busy} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={toggleClosed}>
                  {s.status === "closed" ? t("moim_schedule_reopen_btn") : t("moim_schedule_close_btn")}
                </button>
              ) : null}
              {!s.viewer.isHost || my !== "confirmed" ? (
                <button type="button" disabled={busy} className={`${moimCls.btnDanger} ${moimCls.btnSm} w-full`} onClick={cancelSchedule}>
                  {t("moim_schedule_cancel_btn")}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {s.status === "done" ? (
          <MoimScheduleAlbumSection
            moim={moim}
            scheduleId={s.id}
            canAdd={moim.status === "active" && moim.platformState !== "blocked"}
            onReport={onReport}
            onToast={onToast}
          />
        ) : null}
      </div>

      {cta ? (
        <div className="sticky bottom-0 border-t border-sam-border bg-sam-surface px-4 pb-[calc(12px+var(--safe-bottom,0px))] pt-2.5">
          <div className={moimCls.column}>{cta}</div>
        </div>
      ) : null}

      <MotivationSheet open={motivationOpen} onClose={() => setMotivationOpen(false)} onSubmit={submitMotivation} />
    </div>
  );
}
