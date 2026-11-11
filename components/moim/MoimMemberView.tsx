"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, MessageCircle, PenSquare } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { formatAppDate } from "@/lib/i18n/locale-for-app-language";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimBoardDto, MoimDetailDto, MoimMemberDto, MoimPostDto } from "@/lib/moim/moim-api-types";
import { moimRoleRank } from "@/lib/moim/moim-permission-contract";
import { MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS, MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { MoimPostRow } from "@/components/moim/MoimPostRow";
import { MoimHeadBlock, MoimStateNotice } from "@/components/moim/MoimPublicView";
import type { MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { MoimAlbumTab, MoimPinnedAlbumSection } from "@/components/moim/MoimAlbum";
import { MoimScheduleCard, useMoimSchedules } from "@/components/moim/moim-schedule-ui";
import {
  MoimAvatar,
  MoimEmptyState,
  MoimErrorState,
  MoimListSkeleton,
  MoimRoleBadge,
  chipClass,
  moimCls,
  useMoimBoardLabel,
} from "@/components/moim/moim-ui";

type MoimTab = "home" | "schedules" | "board" | "album" | "members";
const MOIM_TABS: readonly MoimTab[] = ["home", "schedules", "board", "album", "members"];
type MoimToast = (message: string, tone?: "default" | "success" | "error") => void;

/** 보는 사람이 이 게시판에 글을 쓸 수 있는가 (화면 표시용 — 최종 판정은 서버) */
export function canWriteMoimBoard(moim: MoimDetailDto, board: MoimBoardDto): boolean {
  if (!board.isActive || moim.status !== "active" || moim.platformState === "blocked") return false;
  return moimRoleRank(moim.viewer.role) >= moimRoleRank(board.writeMinRole);
}

export function activeMoimBoards(moim: MoimDetailDto): MoimBoardDto[] {
  return moim.boards.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 모임 홈 (시안 U4) — 2단 탭 홈·일정·게시판·앨범·멤버, 주소 ?tab=schedules / ?tab=board&board= / ?tab=album / ?tab=members */
export function MoimMemberView({
  moim,
  onReport,
  onToast,
}: {
  moim: MoimDetailDto;
  onReport: (target: MoimReportTarget) => void;
  onToast: MoimToast;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tabParam = sp.get("tab");
  const tab: MoimTab = (MOIM_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as MoimTab) : "home";
  const boardParam = sp.get("board");

  const go = useCallback(
    (next: MoimTab, board?: string | null) => {
      const q = new URLSearchParams();
      if (next !== "home") q.set("tab", next);
      if (next === "board" && board) q.set("board", board);
      const qs = q.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router]
  );

  const tabs: { id: MoimTab; label: string }[] = [
    { id: "home", label: t("moim_home_home_tab") },
    { id: "schedules", label: t("moim_home_schedules_tab") },
    { id: "board", label: t("moim_home_board_tab") },
    { id: "album", label: t("moim_home_album_tab") },
    { id: "members", label: t("moim_home_members_tab", { count: moim.memberCount }) },
  ];

  return (
    <div className={`${moimCls.page} pb-28`}>
      <DibaySecondaryTabRow bordered navRole="secondary" trackAriaLabel={t("moim_home_tabs_aria")}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={dibaySecondaryTabClass(tab === x.id)}
            onClick={() => go(x.id)}
          >
            <span className="relative z-[1] block whitespace-nowrap">{x.label}</span>
          </button>
        ))}
      </DibaySecondaryTabRow>
      <div className={moimCls.column}>
        {tab === "home" ? (
          <MoimHomeTab
            moim={moim}
            onOpenBoard={(b) => go("board", b)}
            onOpenTab={(x) => go(x)}
            onReport={onReport}
            onToast={onToast}
          />
        ) : null}
        {tab === "schedules" ? <MoimSchedulesTab moim={moim} /> : null}
        {tab === "board" ? <MoimBoardTab moim={moim} boardId={boardParam} onBoard={(b) => go("board", b)} /> : null}
        {tab === "album" ? <MoimAlbumTab moim={moim} onReport={onReport} onToast={onToast} /> : null}
        {tab === "members" ? <MoimMembersTab moim={moim} onReport={onReport} /> : null}
      </div>
      {moim.viewer.roomId ? (
        <Link
          href={buildGroupRoomWebPath(moim.viewer.roomId)}
          className={`fixed right-4 ${MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS} ${MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS} inline-flex items-center gap-1.5 rounded-full bg-sam-primary px-4 py-2.5 text-[14px] font-bold text-sam-on-primary shadow-lg active:bg-sam-primary-hover`}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          {t("moim_home_chat_cta")}
        </Link>
      ) : null}
    </div>
  );
}

function PostList({ moim, posts }: { moim: MoimDetailDto; posts: MoimPostDto[] }) {
  const boardLabel = useMoimBoardLabel();
  const byId = useMemo(() => new Map(moim.boards.map((b) => [b.id, b])), [moim.boards]);
  return (
    <div className="grid gap-2 px-4">
      {posts.map((p) => (
        <MoimPostRow key={p.id} post={p} boardLabel={boardLabel(byId.get(p.boardId) ?? { kind: p.boardKind, name: null })} />
      ))}
    </div>
  );
}

/** 홈 — 다가오는 일정 (앞의 3개) */
function MoimHomeUpcoming({ moim, onSeeAll }: { moim: MoimDetailDto; onSeeAll: () => void }) {
  const { t } = useI18n();
  const { items, failed, retry } = useMoimSchedules(moim.id, "upcoming");
  return (
    <section>
      <div className={moimCls.sectionHead}>
        <h2 className={moimCls.sectionTitle}>{t("moim_home_upcoming_title")}</h2>
        <button type="button" className={moimCls.sectionLink} onClick={onSeeAll}>
          {t("moim_home_see_all")}
        </button>
      </div>
      {failed ? (
        <MoimErrorState onRetry={retry} />
      ) : items === null ? (
        <MoimListSkeleton rows={1} />
      ) : items.length === 0 ? (
        <p className="px-4 text-[13px] text-sam-muted">{t("moim_schedule_upcoming_empty")}</p>
      ) : (
        <div className="grid gap-2 px-4">
          {items.slice(0, 3).map((s) => (
            <MoimScheduleCard key={s.id} schedule={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function MoimHomeTab({
  moim,
  onOpenBoard,
  onOpenTab,
  onReport,
  onToast,
}: {
  moim: MoimDetailDto;
  onOpenBoard: (boardId: string | null) => void;
  onOpenTab: (tab: MoimTab) => void;
  onReport: (target: MoimReportTarget) => void;
  onToast: MoimToast;
}) {
  const { t } = useI18n();
  const notice = moim.boards.find((b) => b.kind === "notice");
  return (
    <div>
      <MoimHeadBlock moim={moim} />
      <MoimStateNotice moim={moim} />
      {moim.platformState === "warned" && moimRoleRank(moim.viewer.role) >= moimRoleRank("staff") ? (
        <p className={`${moimCls.noticeWarn} mx-4 mt-3`}>{t("moim_home_warned_notice")}</p>
      ) : null}
      <section>
        <div className={moimCls.sectionHead}>
          <h2 className={moimCls.sectionTitle}>{t("moim_home_notices_title")}</h2>
          {notice ? (
            <button type="button" className={moimCls.sectionLink} onClick={() => onOpenBoard(notice.id)}>
              {t("moim_home_see_all")}
            </button>
          ) : null}
        </div>
        {moim.pinnedNotices.length === 0 ? (
          <p className="px-4 text-[13px] text-sam-muted">{t("moim_home_no_notices")}</p>
        ) : (
          <PostList moim={moim} posts={moim.pinnedNotices} />
        )}
      </section>
      <MoimHomeUpcoming moim={moim} onSeeAll={() => onOpenTab("schedules")} />
      <section>
        <div className={moimCls.sectionHead}>
          <h2 className={moimCls.sectionTitle}>{t("moim_home_recent_title")}</h2>
          <button type="button" className={moimCls.sectionLink} onClick={() => onOpenBoard(null)}>
            {t("moim_home_see_all")}
          </button>
        </div>
        {moim.recentPosts.length === 0 ? (
          <p className="px-4 text-[13px] text-sam-muted">{t("moim_board_empty")}</p>
        ) : (
          <PostList moim={moim} posts={moim.recentPosts} />
        )}
      </section>
      <MoimPinnedAlbumSection moim={moim} onSeeAll={() => onOpenTab("album")} onReport={onReport} onToast={onToast} />
    </div>
  );
}

/** 일정 탭 — 다가오는 일정 / 지난 일정 · 일정 만들기 */
function MoimSchedulesTab({ moim }: { moim: MoimDetailDto }) {
  const { t } = useI18n();
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const { items, failed, retry } = useMoimSchedules(moim.id, scope);
  const canCreate = moim.can.create_schedule;
  return (
    <div>
      <div className={`${moimCls.hScroll} pt-3`} role="tablist" aria-label={t("moim_schedule_scope_aria")}>
        <button type="button" role="tab" aria-selected={scope === "upcoming"} className={chipClass(scope === "upcoming")} onClick={() => setScope("upcoming")}>
          {t("moim_schedule_upcoming_chip")}
        </button>
        <button type="button" role="tab" aria-selected={scope === "past"} className={chipClass(scope === "past")} onClick={() => setScope("past")}>
          {t("moim_schedule_past_chip")}
        </button>
      </div>
      {canCreate ? (
        <div className="px-4 pt-3">
          <Link href={moimRoutes.scheduleNew(moim.id)} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full gap-1.5`}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {t("moim_schedule_create_btn")}
          </Link>
        </div>
      ) : null}
      <div className="pt-3">
        {failed ? (
          <MoimErrorState onRetry={retry} />
        ) : items === null ? (
          <MoimListSkeleton />
        ) : items.length === 0 ? (
          <MoimEmptyState>{scope === "upcoming" ? t("moim_schedule_upcoming_empty") : t("moim_schedule_past_empty")}</MoimEmptyState>
        ) : (
          <div className="grid gap-2 px-4">
            {items.map((s) => (
              <MoimScheduleCard key={s.id} schedule={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MoimBoardTab({ moim, boardId, onBoard }: { moim: MoimDetailDto; boardId: string | null; onBoard: (b: string | null) => void }) {
  const { t } = useI18n();
  const boardLabel = useMoimBoardLabel();
  const boards = useMemo(() => activeMoimBoards(moim), [moim]);
  const current = boards.find((b) => b.id === boardId) ?? null;
  const [posts, setPosts] = useState<MoimPostDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setPosts(null);
    setFailed(false);
    void moimApi.posts(moim.id, { board: current?.id ?? null }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setFailed(true);
        return;
      }
      setPosts(r.items);
      setNextBefore(r.nextBefore);
    });
    return () => {
      alive = false;
    };
  }, [moim.id, current?.id, reload]);

  const loadMore = async () => {
    if (!nextBefore || more) return;
    setMore(true);
    const r = await moimApi.posts(moim.id, { board: current?.id ?? null, before: nextBefore });
    setMore(false);
    if (!r.ok) return;
    setPosts((prev) => [...(prev ?? []), ...r.items.filter((x) => !(prev ?? []).some((p) => p.id === x.id))]);
    setNextBefore(r.nextBefore);
  };

  const writeBoard = current ? (canWriteMoimBoard(moim, current) ? current : null) : boards.find((b) => canWriteMoimBoard(moim, b)) ?? null;

  return (
    <div>
      <div className={`${moimCls.hScroll} pt-3`} role="tablist" aria-label={t("moim_board_chips_aria")}>
        <button type="button" role="tab" aria-selected={!current} className={chipClass(!current)} onClick={() => onBoard(null)}>
          {t("moim_board_all_chip")}
        </button>
        {boards.map((b) => (
          <button key={b.id} type="button" role="tab" aria-selected={current?.id === b.id} className={chipClass(current?.id === b.id)} onClick={() => onBoard(b.id)}>
            {boardLabel(b)}
          </button>
        ))}
      </div>
      {writeBoard ? (
        <div className="px-4 pt-3">
          <Link href={moimRoutes.write(moim.id, writeBoard.id)} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full gap-1.5`}>
            <PenSquare className="h-4 w-4" aria-hidden />
            {t("moim_board_write_btn")}
          </Link>
        </div>
      ) : null}
      <div className="pt-3">
        {failed ? (
          <MoimErrorState onRetry={() => setReload((k) => k + 1)} />
        ) : posts === null ? (
          <MoimListSkeleton />
        ) : posts.length === 0 ? (
          <MoimEmptyState>{t("moim_board_empty")}</MoimEmptyState>
        ) : (
          <>
            <PostList moim={moim} posts={posts} />
            {nextBefore ? (
              <div className="px-4 pt-2">
                <button type="button" disabled={more} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={loadMore}>
                  {more ? t("common_loading") : t("moim_home_more_btn")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MoimMembersTab({ moim, onReport }: { moim: MoimDetailDto; onReport: (target: MoimReportTarget) => void }) {
  const { t, language } = useI18n();
  const [members, setMembers] = useState<MoimMemberDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [target, setTarget] = useState<MoimMemberDto | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => setMyId(getHydrationSafeCurrentUser()?.id ?? null), []);

  useEffect(() => {
    let alive = true;
    setMembers(null);
    setFailed(false);
    void moimApi.members(moim.id).then((r) => {
      if (!alive) return;
      if (!r.ok) setFailed(true);
      else setMembers([...r.members].sort((a, b) => moimRoleRank(b.role) - moimRoleRank(a.role)));
    });
    return () => {
      alive = false;
    };
  }, [moim.id, reload]);

  if (failed) return <MoimErrorState onRetry={() => setReload((k) => k + 1)} />;
  if (members === null) return <div className="pt-3"><MoimListSkeleton /></div>;
  if (members.length === 0) return <MoimEmptyState>{t("moim_members_empty")}</MoimEmptyState>;

  return (
    <div className="pt-2">
      {members.map((m) => {
        const self = m.userId === myId;
        return (
          <button
            key={m.userId}
            type="button"
            disabled={self}
            className="flex w-full items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-2.5 text-left"
            onClick={() => setTarget(m)}
          >
            <MoimAvatar url={m.avatarUrl} name={m.nickname} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <b className="break-words text-[14px] text-sam-fg">{m.nickname}</b>
                <MoimRoleBadge role={m.role} />
                {self ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_members_me_badge")}</span> : null}
              </span>
              <span className="block text-[11.5px] text-sam-muted">
                {[m.bio, m.joinedAt ? t("moim_members_joined", { date: formatAppDate(m.joinedAt, language) }) : ""].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        );
      })}
      <DibayActionSheet
        open={target != null}
        onClose={() => setTarget(null)}
        title={target?.nickname}
        cancelLabel={t("common_cancel")}
        items={
          target
            ? [
                {
                  key: "report",
                  label: t("moim_menu_report"),
                  danger: true,
                  onClick: () => onReport({ type: "member", id: target.userId }),
                },
              ]
            : []
        }
      />
    </div>
  );
}
