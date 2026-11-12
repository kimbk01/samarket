"use client";

/**
 * 모임 상세 탭 본문 (설계 moim §8 「모임 상세」) — 가입신청 · 게시글(댓글) · 일정 · 앨범 · 채팅 · 신고 · 운영기록 · 프로필 변경 이력.
 * 조치(숨김·복구(숨김 해제)·삭제·삭제 복구·일정 취소)는 사유 필수 조치 시트 → `/api/admin/moim/content`. 삭제·삭제 복구는 최고관리자만.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityPagination,
  CommunityTable,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import type { MoimAdminContentAction, MoimAdminContentType, MoimAdminDetailSection, MoimAdminPerson } from "@/lib/admin/moim/moim-admin-contract";
import {
  MOIM_ADMIN_REASON,
  MoimAdminPersonCell,
  MoimAdminTime,
  MoimContentStatusBadge,
  moimAdminSend,
  moimReasonCodeLabel,
  useMoimAdminAccess,
} from "@/components/admin/moim/admin-moim-shared";

const PAGE = 50;

type SectionResponse<R> = { ok?: boolean; error?: string; total?: number | null; rows?: R[] };

/** 상세 섹션 조회 (쪽 단위) */
export function useMoimSection<R>(moimId: string, section: Exclude<MoimAdminDetailSection, "info">, extra?: Record<string, string>) {
  const [page, setPage] = useState(1);
  const sp = new URLSearchParams({ section, limit: String(PAGE), offset: String((page - 1) * PAGE), ...(extra ?? {}) });
  const { state, reload } = useCommunityAdminJson<SectionResponse<R>>(`/api/admin/moim/moims/${encodeURIComponent(moimId)}?${sp.toString()}`);
  const rows = (state.data?.rows ?? []) as R[];
  const total = typeof state.data?.total === "number" ? state.data.total : null;
  return { state, reload, rows, total, page, setPage };
}

/** 섹션 본문 4상태 + 페이지 */
export function MoimSectionBody<R>({
  sec,
  emptyKey,
  children,
}: {
  sec: ReturnType<typeof useMoimSection<R>>;
  emptyKey: MessageKey;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { state, rows, total, page, setPage, reload } = sec;
  if (state.status === "loading" && !state.data) return <AdminLoadingState ko />;
  if (state.status === "error") return <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />;
  if (rows.length === 0) return <AdminEmptyState ko message={t(emptyKey)} />;
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">{children}</div>
      <CommunityPagination page={page} pageSize={PAGE} total={total} onPage={setPage} disabled={state.status === "loading"} />
    </div>
  );
}

/* ───────── 콘텐츠 조치 시트 ───────── */

type ContentTarget = { type: MoimAdminContentType; id: string; action: MoimAdminContentAction; label: string };

export function useMoimContentAction(onDone: (kind: CommunitySheetSettle) => void) {
  const { t } = useI18n();
  const [target, setTarget] = useState<ContentTarget | null>(null);
  const node = target ? (
    <CommunityActionSheet
      title={t(`admin_moim_action_${target.action}` as MessageKey)}
      rows={[
        { label: t("admin_moim_field_target"), value: t(`admin_moim_target_${target.type}` as MessageKey) },
        { label: t("admin_moim_field_content"), value: target.label },
      ]}
      notice={
        target.action === "cancel"
          ? t("admin_moim_action_cancel_notice")
          : target.action === "delete"
            ? t("admin_moim_action_delete_notice")
            : target.action === "undelete"
              ? t("admin_moim_action_undelete_notice")
              : undefined
      }
      reason={MOIM_ADMIN_REASON}
      destructive={target.action === "delete" || target.action === "cancel"}
      confirmLabel={t(`admin_moim_action_${target.action}` as MessageKey)}
      onSubmit={(reason) => moimAdminSend("/api/admin/moim/content", { type: target.type, id: target.id, action: target.action, reason }, t)}
      onClose={() => setTarget(null)}
      onSettled={(kind) => {
        setTarget(null);
        onDone(kind);
      }}
    />
  ) : null;
  return { open: setTarget, node };
}

/** 숨김·복구·삭제 버튼 (상태에 맞는 것만 · 삭제/삭제 항목 복구 = 최고관리자) */
export function MoimContentButtons({
  type,
  id,
  status,
  label,
  open,
}: {
  type: Exclude<MoimAdminContentType, "schedule">;
  id: string;
  status: string;
  label: string;
  open: (t: ContentTarget) => void;
}) {
  const { t } = useI18n();
  const { isSuperAdmin } = useMoimAdminAccess();
  return (
    <div className="flex flex-wrap gap-1">
      {status === "active" ? (
        <AdminActionButton size="sm" variant="secondary" onClick={() => open({ type, id, action: "hide", label })}>
          {t("admin_moim_action_hide")}
        </AdminActionButton>
      ) : null}
      {status === "hidden" ? (
        <AdminActionButton size="sm" variant="secondary" onClick={() => open({ type, id, action: "restore", label })}>
          {t("admin_moim_action_restore")}
        </AdminActionButton>
      ) : null}
      {status === "deleted" && isSuperAdmin ? (
        <AdminActionButton size="sm" variant="secondary" onClick={() => open({ type, id, action: "undelete", label })}>
          {t("admin_moim_action_undelete")}
        </AdminActionButton>
      ) : null}
      {status !== "deleted" && isSuperAdmin ? (
        <AdminActionButton size="sm" variant="danger" onClick={() => open({ type, id, action: "delete", label })}>
          {t("admin_moim_action_delete")}
        </AdminActionButton>
      ) : null}
    </div>
  );
}

function clip(s: string | null | undefined, n = 80): string {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v.length > n ? `${v.slice(0, n)}…` : v || "—";
}

/* ───────── 가입신청 (읽기 전용) ───────── */

type RequestRow = {
  id: string;
  user_id: string;
  answers: unknown;
  status: string;
  reason: string | null;
  decided_at: string | null;
  created_at: string;
  account: MoimAdminPerson | null;
  decider: MoimAdminPerson | null;
  moimNickname: string | null;
};

export function MoimRequestsPanel({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const sec = useMoimSection<RequestRow>(moimId, "requests");
  return (
    <MoimSectionBody sec={sec} emptyKey="admin_moim_requests_empty">
      <CommunityTable head={[t("admin_moim_col_applicant"), t("admin_moim_col_answers"), t("admin_moim_col_status"), t("admin_moim_col_requested_at"), t("admin_moim_col_decided")]}>
        {sec.rows.map((r) => (
          <tr key={r.id} className="border-b border-sam-border-soft">
            <td className={COMMUNITY_TD}>
              <MoimAdminPersonCell person={r.account} moimNickname={r.moimNickname} />
            </td>
            <td className={`${COMMUNITY_TD} max-w-[320px] whitespace-pre-wrap [overflow-wrap:anywhere]`}>
              {Array.isArray(r.answers) && r.answers.length ? (r.answers as unknown[]).map((a, i) => <div key={i}>{String(a ?? "")}</div>) : "—"}
            </td>
            <td className={COMMUNITY_TD}>{t(`admin_moim_request_status_${r.status}` as MessageKey)}</td>
            <td className={COMMUNITY_TD}>
              <MoimAdminTime iso={r.created_at} />
            </td>
            <td className={COMMUNITY_TD}>
              {r.decided_at ? <MoimAdminTime iso={r.decided_at} /> : "—"}
              {r.reason ? <div className="text-[12px] text-sam-muted">{r.reason}</div> : null}
            </td>
          </tr>
        ))}
      </CommunityTable>
    </MoimSectionBody>
  );
}

/* ───────── 게시글 · 댓글 ───────── */

type PostRow = {
  id: string;
  title: string;
  body: string;
  images: unknown;
  visibility: string;
  is_pinned: boolean;
  status: string;
  hidden_reason: string | null;
  comment_count: number;
  created_at: string;
  authorNickname: string | null;
  board: { kind: string; name: string | null } | null;
};

type CommentRow = { id: string; post_id: string; body: string; status: string; created_at: string; authorNickname: string | null };

export function MoimPostsPanel({ moimId, onResult }: { moimId: string; onResult: (kind: CommunitySheetSettle) => void }) {
  const { t } = useI18n();
  const posts = useMoimSection<PostRow>(moimId, "posts");
  const [postFilter, setPostFilter] = useState<string | null>(null);
  const comments = useMoimSection<CommentRow>(moimId, "comments", postFilter ? { postId: postFilter } : undefined);
  const action = useMoimContentAction((kind) => {
    posts.reload();
    comments.reload();
    onResult(kind);
  });
  const boardName = (b: PostRow["board"]) => (!b ? "—" : b.kind === "custom" ? b.name ?? "—" : t(`moim_board_${b.kind}` as MessageKey));
  return (
    <div className="space-y-5">
      <MoimSectionBody sec={posts} emptyKey="admin_moim_posts_empty">
        <CommunityTable head={[t("admin_moim_col_post"), t("admin_moim_col_board"), t("admin_moim_col_author"), t("admin_moim_col_status"), t("admin_moim_col_created"), t("admin_moim_col_actions")]}>
          {posts.rows.map((r) => {
            const imgs = Array.isArray(r.images) ? (r.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
            const label = clip(r.title || r.body, 60);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top">
                <td className={`${COMMUNITY_TD} max-w-[360px]`}>
                  {r.title ? <div className="font-medium text-sam-fg">{r.title}</div> : null}
                  <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{clip(r.body, 200)}</div>
                  {imgs.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {imgs.slice(0, 4).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element -- 운영자 확인용 미리보기 (외부 저장소 URL)
                        <img key={u} src={u} alt="" className="h-12 w-12 rounded-ui-rect object-cover" />
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1 text-[12px] text-sam-muted">
                    {r.is_pinned ? <AdminToneBadge tone="progress">{t("admin_moim_pinned")}</AdminToneBadge> : null}
                    <span>{t(r.visibility === "public" ? "admin_moim_visibility_public" : "admin_moim_visibility_members")}</span>
                    <AdminActionButton variant="ghost" size="sm" className="h-auto! px-0!" onClick={() => setPostFilter(r.id)}>
                      {t("admin_moim_comments_of_post", { n: r.comment_count })}
                    </AdminActionButton>
                  </div>
                  {r.hidden_reason ? <div className="text-[12px] text-sam-muted">{t("admin_moim_hidden_reason", { reason: r.hidden_reason })}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>{boardName(r.board)}</td>
                <td className={COMMUNITY_TD}>{r.authorNickname ?? "—"}</td>
                <td className={COMMUNITY_TD}>
                  <MoimContentStatusBadge value={r.status} />
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.created_at} />
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimContentButtons type="post" id={r.id} status={r.status} label={label} open={action.open} />
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </MoimSectionBody>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-sam-fg">{t("admin_moim_comments_title")}</h3>
          {postFilter ? (
            <AdminActionButton size="sm" variant="quiet" onClick={() => setPostFilter(null)}>
              {t("admin_moim_comments_all")}
            </AdminActionButton>
          ) : null}
        </div>
        <MoimSectionBody sec={comments} emptyKey="admin_moim_comments_empty">
          <CommunityTable head={[t("admin_moim_col_comment"), t("admin_moim_col_author"), t("admin_moim_col_status"), t("admin_moim_col_created"), t("admin_moim_col_actions")]}>
            {comments.rows.map((r) => (
              <tr key={r.id} className="border-b border-sam-border-soft align-top">
                <td className={`${COMMUNITY_TD} max-w-[420px] whitespace-pre-wrap [overflow-wrap:anywhere]`}>{clip(r.body, 300)}</td>
                <td className={COMMUNITY_TD}>{r.authorNickname ?? "—"}</td>
                <td className={COMMUNITY_TD}>
                  <MoimContentStatusBadge value={r.status} />
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.created_at} />
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimContentButtons type="comment" id={r.id} status={r.status} label={clip(r.body, 60)} open={action.open} />
                </td>
              </tr>
            ))}
          </CommunityTable>
        </MoimSectionBody>
      </div>
      {action.node}
    </div>
  );
}

/* ───────── 일정 ───────── */

type ScheduleRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  place_text: string;
  capacity: number | null;
  confirmed_count: number;
  status: string;
  room_id: string | null;
  hostNickname: string | null;
};

export function MoimSchedulesPanel({ moimId, onResult }: { moimId: string; onResult: (kind: CommunitySheetSettle) => void }) {
  const { t } = useI18n();
  const sec = useMoimSection<ScheduleRow>(moimId, "schedules");
  const action = useMoimContentAction((kind) => {
    sec.reload();
    onResult(kind);
  });
  return (
    <>
      <MoimSectionBody sec={sec} emptyKey="admin_moim_schedules_empty">
        <CommunityTable head={[t("admin_moim_col_schedule"), t("admin_moim_col_starts"), t("admin_moim_col_host"), t("admin_moim_col_participants"), t("admin_moim_col_status"), t("admin_moim_col_actions")]}>
          {sec.rows.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft align-top">
              <td className={COMMUNITY_TD}>
                <div className="font-medium text-sam-fg">{r.title}</div>
                {r.place_text ? <div className="text-[12px] text-sam-muted">{r.place_text}</div> : null}
              </td>
              <td className={COMMUNITY_TD}>
                <MoimAdminTime iso={r.starts_at} />
              </td>
              <td className={COMMUNITY_TD}>{r.hostNickname ?? "—"}</td>
              <td className={COMMUNITY_TD}>{r.capacity ? `${r.confirmed_count}/${r.capacity}` : r.confirmed_count}</td>
              <td className={COMMUNITY_TD}>{t(`moim_schedule_status_${r.status}_badge` as MessageKey)}</td>
              <td className={COMMUNITY_TD}>
                <div className="flex flex-wrap gap-1">
                  {r.room_id ? (
                    <Link href={`/admin/chats/messenger/${encodeURIComponent(r.room_id)}`} className="text-[13px] text-sam-primary hover:underline">
                      {t("admin_moim_open_chat")}
                    </Link>
                  ) : null}
                  {r.status !== "done" && r.status !== "cancelled" ? (
                    <AdminActionButton size="sm" variant="danger" onClick={() => action.open({ type: "schedule", id: r.id, action: "cancel", label: r.title })}>
                      {t("admin_moim_action_cancel")}
                    </AdminActionButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </CommunityTable>
      </MoimSectionBody>
      {action.node}
    </>
  );
}

/* ───────── 앨범 ───────── */

type AlbumRow = { id: string; url: string; is_pinned: boolean; status: string; created_at: string; uploaderNickname: string | null };

export function MoimAlbumPanel({ moimId, onResult }: { moimId: string; onResult: (kind: CommunitySheetSettle) => void }) {
  const { t } = useI18n();
  const sec = useMoimSection<AlbumRow>(moimId, "album");
  const action = useMoimContentAction((kind) => {
    sec.reload();
    onResult(kind);
  });
  return (
    <>
      <MoimSectionBody sec={sec} emptyKey="admin_moim_album_empty">
        <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5">
          {sec.rows.map((r) => (
            <li key={r.id} className="space-y-1 rounded-ui-rect border border-sam-border-soft p-2">
              <a href={r.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- 운영자 확인용 미리보기 (외부 저장소 URL) */}
                <img src={r.url} alt="" className="aspect-square w-full rounded-ui-rect object-cover" />
              </a>
              <div className="flex flex-wrap items-center gap-1 text-[12px] text-sam-muted">
                <MoimContentStatusBadge value={r.status} />
                {r.is_pinned ? <AdminToneBadge tone="progress">{t("admin_moim_pinned")}</AdminToneBadge> : null}
              </div>
              <div className="text-[12px] text-sam-muted">
                {r.uploaderNickname ?? "—"} · <MoimAdminTime iso={r.created_at} />
              </div>
              <MoimContentButtons type="album" id={r.id} status={r.status} label={t("admin_moim_target_album")} open={action.open} />
            </li>
          ))}
        </ul>
      </MoimSectionBody>
      {action.node}
    </>
  );
}

/* ───────── 채팅 (기존 메신저 어드민 화면으로) ───────── */

type ChatRow = { kind: "main" | "schedule"; roomId: string; scheduleId: string | null; title: string | null; scheduleStatus: string | null; startsAt: string | null; isReadonly: boolean | null };

export function MoimChatsPanel({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const sec = useMoimSection<ChatRow>(moimId, "chats");
  return (
    <MoimSectionBody sec={sec} emptyKey="admin_moim_chats_empty">
      <CommunityTable head={[t("admin_moim_col_room"), t("admin_moim_col_kind"), t("admin_moim_col_readonly"), t("admin_moim_col_actions")]}>
        {sec.rows.map((r) => (
          <tr key={r.roomId} className="border-b border-sam-border-soft">
            <td className={COMMUNITY_TD}>
              <div className="font-medium text-sam-fg">{r.title ?? "—"}</div>
              {r.startsAt ? <div className="text-[12px] text-sam-muted"><MoimAdminTime iso={r.startsAt} /></div> : null}
            </td>
            <td className={COMMUNITY_TD}>{t(r.kind === "main" ? "admin_moim_room_main" : "admin_moim_room_schedule")}</td>
            <td className={COMMUNITY_TD}>{r.isReadonly == null ? "—" : t(r.isReadonly ? "admin_moim_yes" : "admin_moim_no")}</td>
            <td className={COMMUNITY_TD}>
              <Link href={`/admin/chats/messenger/${encodeURIComponent(r.roomId)}`} className="text-sam-primary hover:underline">
                {t("admin_moim_open_chat")}
              </Link>
            </td>
          </tr>
        ))}
      </CommunityTable>
    </MoimSectionBody>
  );
}

/* ───────── 신고 (읽기 전용) ───────── */

type ReportRow = { id: string; target_type: string; target_id: string; reason_code: string; detail: string | null; status: string; created_at: string; reporter: MoimAdminPerson | null };

export function MoimReportsPanel({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const sec = useMoimSection<ReportRow>(moimId, "reports");
  return (
    <MoimSectionBody sec={sec} emptyKey="admin_moim_reports_empty">
      <CommunityTable head={[t("admin_moim_col_target"), t("admin_moim_col_reason"), t("admin_moim_col_reporter"), t("admin_moim_col_status"), t("admin_moim_col_created")]}>
        {sec.rows.map((r) => (
          <tr key={r.id} className="border-b border-sam-border-soft align-top">
            <td className={COMMUNITY_TD}>
              <Link href={`/admin/community/moims/reports?reportId=${encodeURIComponent(r.id)}`} className="text-sam-primary hover:underline">
                {t(`admin_moim_target_${r.target_type}` as MessageKey)}
              </Link>
            </td>
            <td className={`${COMMUNITY_TD} max-w-[320px]`}>
              <div>{moimReasonCodeLabel(t, r.reason_code)}</div>
              {r.detail ? <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.detail}</div> : null}
            </td>
            <td className={COMMUNITY_TD}>
              <MoimAdminPersonCell person={r.reporter} />
            </td>
            <td className={COMMUNITY_TD}>{t(`admin_moim_report_status_${r.status}` as MessageKey)}</td>
            <td className={COMMUNITY_TD}>
              <MoimAdminTime iso={r.created_at} />
            </td>
          </tr>
        ))}
      </CommunityTable>
    </MoimSectionBody>
  );
}

/* ───────── 운영기록 (moim_events, 최신 순) ───────── */

type EventRow = { id: number; actor_kind: string; type: string; target_id: string | null; payload: Record<string, unknown> | null; created_at: string; actor: MoimAdminPerson | null };

export function MoimEventsPanel({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const sec = useMoimSection<EventRow>(moimId, "events");
  return (
    <MoimSectionBody sec={sec} emptyKey="admin_moim_events_empty">
      <CommunityTable head={[t("admin_moim_col_time"), t("admin_moim_col_actor"), t("admin_moim_col_event"), t("admin_moim_col_detail")]}>
        {sec.rows.map((r) => {
          const reason = r.payload && typeof r.payload.reason === "string" ? r.payload.reason : null;
          return (
            <tr key={r.id} className="border-b border-sam-border-soft align-top">
              <td className={COMMUNITY_TD}>
                <MoimAdminTime iso={r.created_at} />
              </td>
              <td className={COMMUNITY_TD}>
                <AdminToneBadge tone={r.actor_kind === "admin" ? "warning" : r.actor_kind === "system" ? "neutral" : "progress"}>
                  {t(`admin_moim_actor_${r.actor_kind}` as MessageKey)}
                </AdminToneBadge>
                {r.actor ? <MoimAdminPersonCell person={r.actor} /> : null}
              </td>
              <td className={`${COMMUNITY_TD} font-mono text-[12px]`}>{r.type}</td>
              <td className={`${COMMUNITY_TD} max-w-[420px] text-[12px] text-sam-muted [overflow-wrap:anywhere]`}>
                {reason ? <div className="text-sam-fg">{t("admin_moim_reason_value", { reason })}</div> : null}
                {r.target_id ? <div>{t("admin_moim_target_id", { id: r.target_id })}</div> : null}
              </td>
            </tr>
          );
        })}
      </CommunityTable>
    </MoimSectionBody>
  );
}

/* ───────── 모임 프로필 변경 이력 (멤버 탭 안) ───────── */

type ProfileHistoryRow = { id: number; user_id: string; nickname: string; avatar_url: string | null; bio: string; changed_at: string; account: MoimAdminPerson | null };

export function MoimProfileHistoryPanel({ moimId, userId }: { moimId: string; userId: string | null }) {
  const { t } = useI18n();
  const sec = useMoimSection<ProfileHistoryRow>(moimId, "profile_history", userId ? { userId } : undefined);
  return (
    <MoimSectionBody sec={sec} emptyKey="admin_moim_profile_history_empty">
      <CommunityTable head={[t("admin_moim_col_time"), t("admin_moim_col_account"), t("admin_moim_col_moim_profile")]}>
        {sec.rows.map((r) => (
          <tr key={r.id} className="border-b border-sam-border-soft align-top">
            <td className={COMMUNITY_TD}>
              <MoimAdminTime iso={r.changed_at} />
            </td>
            <td className={COMMUNITY_TD}>
              <MoimAdminPersonCell person={r.account} />
            </td>
            <td className={`${COMMUNITY_TD} max-w-[420px] [overflow-wrap:anywhere]`}>
              <div className="font-medium text-sam-fg">{r.nickname}</div>
              {r.bio ? <div className="text-[12px] text-sam-muted">{r.bio}</div> : null}
            </td>
          </tr>
        ))}
      </CommunityTable>
    </MoimSectionBody>
  );
}

