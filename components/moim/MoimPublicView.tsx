"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import type { MessageKey } from "@/lib/i18n/messages";
import { MoimJoinSheet } from "@/components/moim/MoimJoinSheet";
import { MoimPostRow } from "@/components/moim/MoimPostRow";
import { MoimScheduleDateBox, formatMoimScheduleCount, formatMoimScheduleShort } from "@/components/moim/moim-schedule-ui";
import { MoimCover, formatMoimCount, moimCls, moimTopicOrCategoryLabel, useMoimBoardLabel } from "@/components/moim/moim-ui";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";

/** 모임 머리 — 사진 · 이름 · 카테고리·동네 · 멤버 수 · 가입 방식 · 소개 (공개·멤버 공통) */
export function MoimHeadBlock({ moim, showIntro = true }: { moim: MoimDetailDto; showIntro?: boolean }) {
  const { t, language } = useI18n();
  const sub = [moimTopicOrCategoryLabel(moim, language), moim.cityLabel].filter(Boolean).join(" · ");
  return (
    <div>
      <MoimCover url={moim.coverImageUrl} className="h-[140px] w-full" />
      <div className="border-b border-sam-border bg-sam-surface px-4 py-3">
        {sub ? <p className="text-[12px] text-sam-muted">{sub}</p> : null}
        <h1 className="break-words text-[18px] font-bold text-sam-fg">{moim.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-sam-muted">
          <span>{formatMoimCount(moim.memberCount, moim.capacity, t)}</span>
          <span>{t(`moim_join_mode_${moim.joinMode}` as MessageKey)}</span>
          <span>{t("moim_screen_last_activity", { time: formatRelativeTimeAgo(moim.lastActivityAt, language) })}</span>
        </div>
        {showIntro && moim.intro ? <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{moim.intro}</p> : null}
      </div>
    </div>
  );
}

/** 상태 안내 줄 — 종료·차단 */
export function MoimStateNotice({ moim }: { moim: MoimDetailDto }) {
  const { t } = useI18n();
  if (moim.status === "closed") return <p className={`${moimCls.noticeWarn} mx-4 mt-3`}>{t("moim_screen_closed_notice")}</p>;
  if (moim.platformState === "blocked") return <p className={`${moimCls.noticeBad} mx-4 mt-3`}>{t("moim_err_moim_blocked")}</p>;
  return null;
}

/** 모임 공개 페이지 (시안 U3) — 비멤버 · 가입 신청 · 신청 취소 */
export function MoimPublicView({
  moim,
  inviteToken,
  onChanged,
  onToast,
}: {
  moim: MoimDetailDto;
  inviteToken?: string | null;
  onChanged: () => void;
  onToast: (message: string, tone?: "default" | "success" | "error") => void;
}) {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const boardLabel = useMoimBoardLabel();
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boardById = new Map(moim.boards.map((b) => [b.id, b]));
  const pending = moim.viewer.status === "pending" || !!moim.viewer.pendingRequestId;
  const full = moim.capacity != null && moim.memberCount >= moim.capacity;
  const blocked = moim.status !== "active" || moim.platformState === "blocked";

  const cancelJoin = async () => {
    const ok = await dibayConfirm({
      title: t("moim_join_cancel_confirm_title"),
      confirmLabel: t("moim_join_cancel_btn"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    const r = await moimApi.cancelJoin(moim.id);
    setBusy(false);
    if (!r.ok) {
      onToast(t(moimErrorKey(r.error)), "error");
      return;
    }
    onToast(t("moim_join_cancelled_toast"));
    onChanged();
  };

  const submitJoin = async (v: { answers: string[]; nickname: string; bio: string }) => {
    const r = await moimApi.join(moim.id, {
      answers: moim.joinMode === "approval" ? v.answers : undefined,
      nickname: v.nickname,
      bio: v.bio,
      inviteToken: inviteToken ?? null,
    });
    if (!r.ok) return t(moimErrorKey(r.error));
    setJoinOpen(false);
    onToast(r.status === "active" ? t("moim_join_done_toast") : t("moim_join_requested_toast"), "success");
    onChanged();
    return null;
  };

  let cta: React.ReactNode;
  if (blocked) {
    cta = null;
  } else if (!moim.viewer.loggedIn) {
    cta = (
      <Link href={buildLoginPath(pathname ?? undefined)} className={`${moimCls.btnPrimary} w-full`}>
        {t("moim_join_login_btn")}
      </Link>
    );
  } else if (moim.viewer.banned || moim.viewer.status === "banned") {
    cta = (
      <button type="button" disabled className={`${moimCls.btnPrimary} w-full`}>
        {t("moim_err_moim_join_not_allowed")}
      </button>
    );
  } else if (pending) {
    cta = (
      <div className="grid gap-2">
        <p className="text-center text-[13px] text-sam-muted">{t("moim_join_pending_note")}</p>
        <button type="button" disabled={busy} className={`${moimCls.btnSecondary} w-full`} onClick={cancelJoin}>
          {t("moim_join_cancel_btn")}
        </button>
      </div>
    );
  } else if (full) {
    cta = (
      <button type="button" disabled className={`${moimCls.btnPrimary} w-full`}>
        {t("moim_join_full_btn")}
      </button>
    );
  } else {
    cta = (
      <button type="button" className={`${moimCls.btnPrimary} w-full`} onClick={() => setJoinOpen(true)}>
        {moim.joinMode === "approval" ? t("moim_join_request_btn") : t("moim_join_btn")}
      </button>
    );
  }

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <div className={`${moimCls.column} flex-1 pb-6`}>
        <MoimHeadBlock moim={moim} />
        <MoimStateNotice moim={moim} />

        {moim.pinnedNotices.length > 0 ? (
          <section>
            <div className={moimCls.sectionHead}>
              <h2 className={moimCls.sectionTitle}>{t("moim_home_notices_title")}</h2>
            </div>
            <div className="grid gap-2 px-4">
              {moim.pinnedNotices.map((p) => (
                <MoimPostRow key={p.id} post={p} boardLabel={boardLabel(boardById.get(p.boardId) ?? { kind: p.boardKind, name: null })} />
              ))}
            </div>
          </section>
        ) : null}

        {moim.upcomingSchedules.length > 0 ? (
          <section>
            <div className={moimCls.sectionHead}>
              <h2 className={moimCls.sectionTitle}>{t("moim_home_upcoming_title")}</h2>
            </div>
            <div className="grid gap-2 px-4">
              {moim.upcomingSchedules.map((s) => (
                <div key={s.id} className={`${moimCls.card} flex items-center gap-3 p-3`}>
                  <MoimScheduleDateBox iso={s.startsAt} />
                  <span className="min-w-0 flex-1">
                    <b className="block break-words text-[14px] text-sam-fg">{s.title}</b>
                    <span className="block text-[12px] text-sam-muted">
                      {formatMoimScheduleShort(s.startsAt, language)} · {formatMoimScheduleCount(s.confirmedCount, s.capacity, t)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className={moimCls.sectionHead}>
            <h2 className={moimCls.sectionTitle}>{t("moim_home_recent_title")}</h2>
          </div>
          {moim.recentPosts.length === 0 ? (
            <p className="px-4 text-[13px] text-sam-muted">{t("moim_public_no_posts")}</p>
          ) : (
            <div className="grid gap-2 px-4">
              {moim.recentPosts.map((p) => (
                <MoimPostRow key={p.id} post={p} boardLabel={boardLabel(boardById.get(p.boardId) ?? { kind: p.boardKind, name: null })} />
              ))}
            </div>
          )}
        </section>

        <p className={`${moimCls.hint} px-4 pt-4`}>{t("moim_public_members_only_note")}</p>
      </div>

      {cta ? (
        <MoimStickyFooter>
          <div className={moimCls.column}>{cta}</div>
        </MoimStickyFooter>
      ) : null}

      <MoimJoinSheet
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title={moim.joinMode === "approval" ? t("moim_join_request_title") : t("moim_join_title")}
        submitLabel={moim.joinMode === "approval" ? t("moim_join_request_btn") : t("moim_join_btn")}
        questions={moim.joinMode === "approval" ? moim.joinQuestions : []}
        defaultNickname={moim.viewer.nickname}
        onSubmit={submitJoin}
      />
    </div>
  );
}
