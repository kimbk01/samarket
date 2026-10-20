"use client";

/**
 * 커뮤니티 공지·상단 고정 (설계 §C-23 · §F-5). 신규 화면.
 * 탭: 게시 중 / 예약 / 종료 (URL `tab`) + 「고정된 글」(피드 3 · 카테고리별 2 한도 대비 현재 수).
 * 「공지 작성」(L1 「공지 게시」) · 행 「수정」(L1 「수정 저장」) · 「공지 종료」(L1) · 「고정 해제」(L1).
 * 앱 전체 공지(app_notices)는 따로 — 링크로만 안내한다.
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityListPagination,
  CommunityListShell,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import {
  COMMUNITY_GONE_MESSAGE,
  COMMUNITY_POSTS_LIST_PATH,
  COMMUNITY_STALE_MESSAGE,
  communityJsonFetch,
  communityPostErrorText,
  manilaLocalInputToUtcIso,
  toCommunitySheetResult,
  useCommunityTopicOptions,
  useTopicNameOf,
  utcIsoToManilaLocalInput,
  type CommunityBanner,
} from "@/components/admin/community/posts/community-post-admin-shared";

type NoticeRow = {
  id: string;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  topic_id?: string | null;
  topic_slug?: string | null;
  is_notice?: boolean | null;
  notice_starts_at?: string | null;
  notice_ends_at?: string | null;
  pinned_at?: string | null;
  pinned_until?: string | null;
  pin_scope?: string | null;
  pin_rank?: number | null;
  pin_reason?: string | null;
  view_count?: number | null;
  comment_count?: number | null;
  created_at?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  author_label?: string | null;
  pinned_by_label?: string | null;
  origin_kind?: string | null;
};

type Payload = {
  total?: number;
  notices?: NoticeRow[];
  pinned?: NoticeRow[];
  pinLimits?: { feed?: { limit: number; count: number }; topic?: { limit: number; counts: Record<string, number> } };
};

const TABS = [
  { value: "live", label: "게시 중" },
  { value: "scheduled", label: "예약" },
  { value: "ended", label: "종료" },
] as const;

const FIELD =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary";

type Editor = {
  mode: "create" | "edit";
  id?: string;
  updatedAt?: string;
  title: string;
  content: string;
  topicId: string;
  startsAt: string;
  endsAt: string;
  pin: boolean;
  pinScope: "feed" | "topic";
  pinUntil: string;
  original?: { title: string; content: string; topicId: string; startsAt: string; endsAt: string };
};

const EMPTY_EDITOR: Editor = {
  mode: "create",
  title: "",
  content: "",
  topicId: "",
  startsAt: "",
  endsAt: "",
  pin: false,
  pinScope: "feed",
  pinUntil: "",
};

function isPinnedNow(r: NoticeRow): boolean {
  return Boolean(r.pinned_at) && (!r.pinned_until || Date.parse(r.pinned_until) > Date.now());
}

function phtOrDash(iso: string | null | undefined, empty: string): string {
  return iso ? `${formatAdminManilaDateTime(iso)} PHT` : empty;
}

export function AdminCommunityNoticesPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const qs = useCommunityQueryState();
  const { get, set, selfHref } = qs;
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const noPermTitle = canContent ? undefined : "권한 필요: 게시판 관리";
  const { topics } = useCommunityTopicOptions();
  const topicNameOf = useTopicNameOf(topics);
  const noticeTopics = useMemo(() => topics.filter((t) => t.is_active && !t.allow_meetup), [topics]);
  const topicNameById = useCallback(
    (topicId: string | null | undefined) => topics.find((t) => t.id === topicId)?.name ?? "카테고리",
    [topics]
  );

  const tabRaw = get("tab");
  const tab = TABS.some((t) => t.value === tabRaw) ? tabRaw : "live";

  const page = qs.page;
  const pageSize = qs.size;
  const [data, setData] = useState<Payload | null>(null);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [ending, setEnding] = useState<NoticeRow | null>(null);
  const [alsoHide, setAlsoHide] = useState(false);
  const [unpinning, setUnpinning] = useState<NoticeRow | null>(null);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      const r = await communityJsonFetch<Payload>(
        `/api/admin/community/notices?tab=${tab}&limit=${pageSize}&offset=${(page - 1) * pageSize}`
      );
      if (cancel) return;
      if (r.ok) {
        setData(r.json);
        setLoadErr(null);
      } else {
        setData(null);
        setLoadErr({ code: r.code, status: r.status });
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [tab, page, pageSize, reloadKey]);

  const settle = (kind: CommunitySheetSettle, okMessage: string) => {
    if (kind === "done") setBanner({ ok: true, message: okMessage });
    else if (kind === "stale") setBanner({ ok: false, code: COMMUNITY_STALE_MESSAGE });
    else setBanner({ ok: false, code: COMMUNITY_GONE_MESSAGE });
    reload();
  };

  const openEdit = async (row: NoticeRow) => {
    setEditorLoading(true);
    const r = await communityJsonFetch<{ post?: Record<string, unknown> }>(
      `/api/admin/community/engine/posts/${encodeURIComponent(row.id)}`
    );
    setEditorLoading(false);
    if (!r.ok || !r.json.post) {
      setBanner({ ok: false, code: communityPostErrorText(r.ok ? "not_found" : r.code) });
      return;
    }
    const p = r.json.post;
    const original = {
      title: String(p.title ?? ""),
      content: String(p.content ?? ""),
      topicId: String(p.topic_id ?? ""),
      startsAt: utcIsoToManilaLocalInput(p.notice_starts_at as string | null),
      endsAt: utcIsoToManilaLocalInput(p.notice_ends_at as string | null),
    };
    setEditor({
      ...EMPTY_EDITOR,
      mode: "edit",
      id: row.id,
      updatedAt: String(p.updated_at ?? ""),
      ...original,
      original,
    });
  };

  const submitEditor = async (ed: Editor) => {
    const topic = topics.find((t) => t.id === ed.topicId);
    const startsAt = ed.startsAt ? manilaLocalInputToUtcIso(ed.startsAt) : null;
    const endsAt = ed.endsAt ? manilaLocalInputToUtcIso(ed.endsAt) : null;
    if (ed.mode === "create") {
      const r = await communityJsonFetch<{ pin?: { ok: boolean; error?: string } }>("/api/admin/community/notices", {
        method: "POST",
        body: {
          title: ed.title.trim(),
          content: ed.content,
          topicId: topic?.id ?? "",
          topicSlug: topic?.slug ?? "",
          startsAt,
          endsAt,
          ...(ed.pin
            ? { pin: { scope: ed.pinScope, until: ed.pinUntil ? manilaLocalInputToUtcIso(ed.pinUntil) : null } }
            : {}),
        },
      });
      if (r.ok && r.json.pin && r.json.pin.ok === false) {
        setBanner({
          ok: false,
          code: `공지는 게시했지만 상단 고정은 하지 못했습니다 — ${communityPostErrorText(r.json.pin.error)}`,
        });
        return { ok: true as const };
      }
      return toCommunitySheetResult(r);
    }
    const o = ed.original;
    const body: Record<string, unknown> = { expectedUpdatedAt: ed.updatedAt ?? "" };
    if (!o || ed.title !== o.title) body.title = ed.title.trim();
    if (!o || ed.content !== o.content) body.content = ed.content;
    if ((!o || ed.topicId !== o.topicId) && topic) {
      body.topicId = topic.id;
      body.topicSlug = topic.slug;
    }
    if (!o || ed.startsAt !== o.startsAt) body.noticeStartsAt = startsAt;
    if (!o || ed.endsAt !== o.endsAt) body.noticeEndsAt = endsAt;
    const r = await communityJsonFetch(`/api/admin/community/notices/${encodeURIComponent(ed.id ?? "")}`, {
      method: "PATCH",
      body,
    });
    return toCommunitySheetResult(r);
  };

  const notices = data?.notices ?? [];
  const noticeTotal = data ? Number(data.total ?? notices.length) : null;
  const pinned = data?.pinned ?? [];
  const feedLimit = data?.pinLimits?.feed ?? { limit: 3, count: 0 };
  const topicLimit = data?.pinLimits?.topic ?? { limit: 2, counts: {} };

  let body: ReactNode;
  if (loading) body = <AdminLoadingState ko={ko} />;
  else if (loadErr) body = <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={reload} />;
  else if (notices.length === 0)
    body = (
      <AdminEmptyState
        ko={ko}
        message={tab === "live" ? "게시 중인 공지가 없습니다." : tab === "scheduled" ? "예약된 공지가 없습니다." : "종료된 공지가 없습니다."}
      />
    );
  else
    body = (
      <CommunityTable head={["제목", "카테고리", "노출 기간 (PHT)", "상태", "고정", "작성", ""]}>
        {notices.map((n) => {
          const pinnedNow = isPinnedNow(n);
          return (
            <tr key={n.id} className="border-b border-sam-border-soft">
              <td className={`${COMMUNITY_TD} max-w-[20rem]`}>
                <Link
                  href={communityDetailHref(`${COMMUNITY_POSTS_LIST_PATH}/${encodeURIComponent(n.id)}`, selfHref)}
                  className="line-clamp-2 font-medium text-sam-fg hover:underline"
                >
                  {String(n.title ?? "").trim() || "제목 없음"}
                </Link>
                <span className="text-[12px] text-sam-muted">
                  조회 {formatAdminNumber(n.view_count ?? 0)} · 댓글 {formatAdminNumber(n.comment_count ?? 0)}
                </span>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap text-sam-muted`}>{topicNameOf(n.topic_slug)}</td>
              <td className={`${COMMUNITY_TD} text-[12px]`}>
                <div>시작 {phtOrDash(n.notice_starts_at, "바로")}</div>
                <div>종료 {phtOrDash(n.notice_ends_at, "없음")}</div>
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityStatusBadge domain="content_status" value={n.status ?? "active"} ko={ko} />
              </td>
              <td className={COMMUNITY_TD}>
                {pinnedNow ? (
                  <AdminToneBadge tone="progress">{adminCommunityLabel("pin_scope", n.pin_scope, ko).label}</AdminToneBadge>
                ) : (
                  <span className="text-sam-muted">—</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                <span className="block text-[12px] text-sam-fg">{n.author_label || "운영팀"}</span>
                <CommunityTimeCell iso={n.published_at ?? n.created_at} />
              </td>
              <td className={COMMUNITY_TD}>
                <span className="flex flex-wrap gap-1">
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    disabled={!canContent || editorLoading}
                    title={noPermTitle}
                    onClick={() => void openEdit(n)}
                  >
                    수정
                  </AdminActionButton>
                  {tab !== "ended" ? (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      disabled={!canContent}
                      title={noPermTitle}
                      onClick={() => {
                        setAlsoHide(false);
                        setEnding(n);
                      }}
                    >
                      공지 종료
                    </AdminActionButton>
                  ) : null}
                  {/* 행 버튼 최대 2개 — 게시 중·예약 공지의 「고정 해제」는 아래 「고정된 글」 표에서 한다. */}
                  {pinnedNow && tab === "ended" ? (
                    <AdminActionButton variant="ghost" size="sm" disabled={!canContent} title={noPermTitle} onClick={() => setUnpinning(n)}>
                      고정 해제
                    </AdminActionButton>
                  ) : null}
                </span>
              </td>
            </tr>
          );
        })}
      </CommunityTable>
    );

  const topicCountEntries = Object.entries(topicLimit.counts ?? {});

  const pinnedSection = (
    <section className="space-y-2" data-community-pinned-section="1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-sam-fg">고정된 글</h2>
        <span className="flex flex-wrap gap-2 text-[12px]">
          <AdminToneBadge tone={feedLimit.count >= feedLimit.limit ? "warning" : "neutral"}>
            피드 전체 {feedLimit.count}/{feedLimit.limit}
          </AdminToneBadge>
          {topicCountEntries.map(([topicId, count]) => (
            <AdminToneBadge key={topicId} tone={count >= topicLimit.limit ? "warning" : "neutral"}>
              {topicNameById(topicId)} {count}/{topicLimit.limit}
            </AdminToneBadge>
          ))}
          {topicCountEntries.length === 0 ? (
            <span className="text-sam-muted">카테고리별 최대 {topicLimit.limit}개</span>
          ) : null}
        </span>
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        {loading ? (
          <AdminLoadingState ko={ko} />
        ) : loadErr ? null : pinned.length === 0 ? (
          <AdminEmptyState ko={ko} message="지금 고정된 글이 없습니다. 회원 글은 게시글 상세에서 「상단 고정」할 수 있습니다." />
        ) : (
          <CommunityTable head={["제목", "범위", "카테고리", "고정 종료", "고정한 관리자 · 사유", ""]}>
            {pinned.map((p) => (
              <tr key={p.id} className="border-b border-sam-border-soft">
                <td className={`${COMMUNITY_TD} max-w-[20rem]`}>
                  <Link
                    href={communityDetailHref(`${COMMUNITY_POSTS_LIST_PATH}/${encodeURIComponent(p.id)}`, selfHref)}
                    className="line-clamp-2 font-medium text-sam-fg hover:underline"
                  >
                    {String(p.title ?? "").trim() || "제목 없음"}
                  </Link>
                  {p.is_notice ? <AdminToneBadge tone="progress">공지</AdminToneBadge> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="pin_scope" value={p.pin_scope} ko={ko} />
                </td>
                <td className={`${COMMUNITY_TD} text-sam-muted`}>{topicNameOf(p.topic_slug)}</td>
                <td className={`${COMMUNITY_TD} text-[12px]`}>{phtOrDash(p.pinned_until, "기한 없음")}</td>
                <td className={`${COMMUNITY_TD} text-[12px]`}>
                  {p.pinned_by_label || "관리자"}
                  {p.pin_reason ? <span className="block text-sam-muted">{p.pin_reason}</span> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionButton variant="ghost" size="sm" disabled={!canContent} title={noPermTitle} onClick={() => setUnpinning(p)}>
                    고정 해제
                  </AdminActionButton>
                </td>
              </tr>
            ))}
          </CommunityTable>
        )}
      </div>
    </section>
  );

  const ed = editor;
  const edTopic = ed ? topics.find((t) => t.id === ed.topicId) : undefined;
  const edReady = Boolean(ed && ed.title.trim() && ed.content.trim() && edTopic);
  const edWindowBad =
    ed && ed.startsAt && ed.endsAt
      ? (manilaLocalInputToUtcIso(ed.endsAt) ?? "") <= (manilaLocalInputToUtcIso(ed.startsAt) ?? "")
      : false;

  return (
    <div className="space-y-4" data-community-notices="1">
      <CommunityListShell
        title="공지·고정"
        description="커뮤니티 피드 상단에 보일 공지를 게시하고, 상단 고정된 글을 관리합니다."
        actions={
          <>
            <AdminActionLink href="/admin/app/notices" variant="quiet">
              앱 전체 공지는 여기서
            </AdminActionLink>
            <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
              새로고침
            </AdminActionButton>
            <AdminActionButton
              variant="primary"
              disabled={!canContent}
              title={noPermTitle}
              onClick={() => setEditor({ ...EMPTY_EDITOR })}
            >
              공지 작성
            </AdminActionButton>
          </>
        }
        banner={<AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />}
        tabs={
          <CommunityTabs
            tabs={TABS.map((t) => ({ ...t, count: t.value === tab && !loading && !loadErr ? noticeTotal : null }))}
            value={tab}
            onChange={(v) => set({ tab: v === "live" ? null : v })}
          />
        }
        footer={!loadErr ? <CommunityListPagination q={qs} total={noticeTotal} disabled={loading} /> : null}
      >
        {body}
      </CommunityListShell>

      {pinnedSection}

      {ed ? (
        <CommunityActionSheet
          title={ed.mode === "create" ? "공지 작성" : "공지 수정"}
          rows={[
            { label: "제목", value: ed.title.trim() || "—" },
            { label: "카테고리", value: edTopic?.name ?? "선택 필요" },
            {
              label: "노출 기간",
              value: `${ed.startsAt ? `${ed.startsAt.replace("T", " ")} PHT` : "바로"} ~ ${
                ed.endsAt ? `${ed.endsAt.replace("T", " ")} PHT` : "종료 시각 없음"
              }`,
            },
            ...(ed.mode === "create"
              ? [
                  {
                    label: "상단 고정",
                    value: ed.pin ? `${ed.pinScope === "feed" ? "피드 전체" : "이 카테고리"} 고정` : "고정 안 함",
                  },
                ]
              : []),
          ]}
          notice="공지는 「DIBAY 운영팀」 이름으로 피드 전체와 선택한 카테고리 상단에 노출 기간 동안 표시됩니다."
          reason={null}
          ready={edReady && !edWindowBad}
          confirmLabel={ed.mode === "create" ? "공지 게시" : "수정 저장"}
          onSubmit={() => submitEditor(ed)}
          onClose={() => setEditor(null)}
          onSettled={(k) => {
            setEditor(null);
            settle(k, ed.mode === "create" ? "공지를 게시했습니다." : "공지를 수정했습니다.");
          }}
        >
          <div className="space-y-3 text-[13px]">
            <label className="block space-y-1">
              <span className="font-semibold text-sam-fg">제목 (필수)</span>
              <input className={FIELD} value={ed.title} onChange={(e) => setEditor({ ...ed, title: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold text-sam-fg">내용 (필수)</span>
              <textarea
                className={`${FIELD} min-h-[160px]`}
                value={ed.content}
                onChange={(e) => setEditor({ ...ed, content: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold text-sam-fg">카테고리 (필수)</span>
              <select className={FIELD} value={ed.topicId} onChange={(e) => setEditor({ ...ed, topicId: e.target.value })}>
                <option value="">카테고리 선택</option>
                {ed.topicId && !noticeTopics.some((t) => t.id === ed.topicId) ? (
                  <option value={ed.topicId}>{topicNameById(ed.topicId)}</option>
                ) : null}
                {noticeTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="font-semibold text-sam-fg">노출 시작 (필리핀 시간)</span>
                <input
                  type="datetime-local"
                  className={FIELD}
                  value={ed.startsAt}
                  onChange={(e) => setEditor({ ...ed, startsAt: e.target.value })}
                />
                <span className="sam-text-xxs text-sam-muted">비우면 바로 게시</span>
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-sam-fg">노출 종료 (필리핀 시간)</span>
                <input
                  type="datetime-local"
                  className={FIELD}
                  value={ed.endsAt}
                  onChange={(e) => setEditor({ ...ed, endsAt: e.target.value })}
                />
                <span className="sam-text-xxs text-sam-muted">비우면 「공지 종료」 전까지 계속</span>
              </label>
            </div>
            {edWindowBad ? <p className="text-[12px] text-sam-danger">노출 종료는 시작보다 뒤여야 합니다.</p> : null}
            {ed.mode === "create" ? (
              <fieldset className="space-y-1 rounded-ui-rect border border-sam-border p-2">
                <label className="flex items-center gap-2 font-semibold text-sam-fg">
                  <input type="checkbox" checked={ed.pin} onChange={(e) => setEditor({ ...ed, pin: e.target.checked })} />
                  상단 고정
                </label>
                {ed.pin ? (
                  <div className="space-y-2 pl-5">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="notice-pin-scope"
                        checked={ed.pinScope === "feed"}
                        onChange={() => setEditor({ ...ed, pinScope: "feed" })}
                      />
                      피드 전체 ({feedLimit.count}/{feedLimit.limit})
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="notice-pin-scope"
                        checked={ed.pinScope === "topic"}
                        onChange={() => setEditor({ ...ed, pinScope: "topic" })}
                      />
                      이 카테고리만 (
                      {edTopic ? `${topicLimit.counts?.[edTopic.id] ?? 0}/${topicLimit.limit}` : `최대 ${topicLimit.limit}`})
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sam-muted">고정 종료 (필리핀 시간, 비우면 기한 없음)</span>
                      <input
                        type="datetime-local"
                        className={FIELD}
                        value={ed.pinUntil}
                        onChange={(e) => setEditor({ ...ed, pinUntil: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
              </fieldset>
            ) : null}
          </div>
        </CommunityActionSheet>
      ) : null}

      {ending ? (
        <CommunityActionSheet
          title="공지 종료"
          rows={[
            { label: "공지", value: `「${String(ending.title ?? "").slice(0, 40)}」` },
            { label: "처리", value: alsoHide ? "고정 해제 + 노출 종료 + 글 숨김" : "고정 해제 + 노출 종료 (글은 일반 글로 남음)" },
          ]}
          notice="공지 표시와 상단 고정이 지금 바로 끝납니다."
          reason={alsoHide ? { minLength: 2, placeholder: "숨김 사유" } : null}
          confirmLabel="공지 종료"
          destructive={alsoHide}
          onSubmit={async (reason) =>
            toCommunitySheetResult(
              await communityJsonFetch(`/api/admin/community/notices/${encodeURIComponent(ending.id)}`, {
                method: "PATCH",
                body: {
                  action: "end",
                  expectedUpdatedAt: ending.updated_at ?? "",
                  alsoHide,
                  ...(reason ? { reason } : {}),
                },
              })
            )
          }
          onClose={() => setEnding(null)}
          onSettled={(k) => {
            setEnding(null);
            settle(k, "공지를 종료했습니다.");
          }}
        >
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={alsoHide} onChange={(e) => setAlsoHide(e.target.checked)} />
            글도 숨기기 (작성자 화면에서만 보임)
          </label>
        </CommunityActionSheet>
      ) : null}

      {unpinning ? (
        <CommunityActionSheet
          title="고정 해제"
          rows={[
            { label: "글", value: `「${String(unpinning.title ?? "").slice(0, 40)}」` },
            { label: "범위", value: adminCommunityLabel("pin_scope", unpinning.pin_scope, ko).label },
          ]}
          notice="상단 고정에서 내립니다. 글과 공지 노출 기간은 그대로입니다."
          reason={null}
          confirmLabel="고정 해제"
          onSubmit={async () =>
            toCommunitySheetResult(
              await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(unpinning.id)}/pin`, {
                method: "DELETE",
                body: {},
              })
            )
          }
          onClose={() => setUnpinning(null)}
          onSettled={(k) => {
            setUnpinning(null);
            settle(k, "고정을 해제했습니다.");
          }}
        />
      ) : null}
    </div>
  );
}
