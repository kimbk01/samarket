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
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityListShell,
  CommunityPagination,
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
  COMMUNITY_POSTS_LIST_PATH,
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

const TABS: readonly { value: "live" | "scheduled" | "ended"; labelKey: MessageKey }[] = [
  { value: "live", labelKey: "admin_community_notices_tab_live" },
  { value: "scheduled", labelKey: "admin_community_notices_tab_scheduled" },
  { value: "ended", labelKey: "admin_community_notices_tab_ended" },
];

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
  const { t, language } = useI18n();
  const ko = language !== "en";
  const { get, set, selfHref, page, size } = useCommunityQueryState();
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const noPermTitle = canContent ? undefined : t("admin_community_notices_no_perm_content");
  const { topics } = useCommunityTopicOptions();
  const topicNameOf = useTopicNameOf(topics);
  const noticeTopics = useMemo(() => topics.filter((t) => t.is_active), [topics]);
  const topicNameById = useCallback(
    (topicId: string | null | undefined) => topics.find((t) => t.id === topicId)?.name ?? t("admin_community_notices_topic_fallback"),
    [topics, t]
  );

  const tabRaw = get("tab");
  const tab = TABS.some((t) => t.value === tabRaw) ? tabRaw : "live";

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
        `/api/admin/community/notices?tab=${tab}&limit=${size}&offset=${(page - 1) * size}`
      );
      if (cancel) return;
      if (r.ok) {
        setData(r.json);
        setLoadErr(null);
      } else {
        // 실패해도 직전 목록은 지우지 않는다 (지시서 §8-5)
        setLoadErr({ code: r.code, status: r.status });
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [tab, page, size, reloadKey]);

  const settle = (kind: CommunitySheetSettle, okMessage: string) => {
    if (kind === "done") setBanner({ ok: true, message: okMessage });
    else if (kind === "stale") setBanner({ ok: false, code: t("admin_community_post_stale") });
    else setBanner({ ok: false, code: t("admin_community_post_gone") });
    reload();
  };

  const openEdit = async (row: NoticeRow) => {
    setEditorLoading(true);
    const r = await communityJsonFetch<{ post?: Record<string, unknown> }>(
      `/api/admin/community/engine/posts/${encodeURIComponent(row.id)}`
    );
    setEditorLoading(false);
    if (!r.ok || !r.json.post) {
      setBanner({ ok: false, code: communityPostErrorText(r.ok ? "not_found" : r.code, language) });
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
          code: t("admin_community_notices_pin_failed", { error: communityPostErrorText(r.json.pin.error, language) }),
        });
        return { ok: true as const };
      }
      return toCommunitySheetResult(r, language);
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
    return toCommunitySheetResult(r, language);
  };

  const notices = data?.notices ?? [];
  const total = typeof data?.total === "number" ? data.total : null;
  const pinned = data?.pinned ?? [];
  const feedLimit = data?.pinLimits?.feed ?? { limit: 3, count: 0 };
  const topicLimit = data?.pinLimits?.topic ?? { limit: 2, counts: {} };

  let body: ReactNode;
  if (loading && !data) body = <AdminLoadingState ko={ko} />;
  else if (loadErr && (!data || notices.length === 0))
    body = <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={reload} />;
  else if (notices.length === 0)
    body = (
      <AdminEmptyState
        ko={ko}
        message={
          tab === "live"
            ? t("admin_community_notices_empty_live")
            : tab === "scheduled"
              ? t("admin_community_notices_empty_scheduled")
              : t("admin_community_notices_empty_ended")
        }
      />
    );
  else
    body = (
      <>
      {loadErr ? <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={reload} /> : null}
      <CommunityTable head={[
        t("admin_community_notices_col_title"),
        t("admin_community_notices_col_category"),
        t("admin_community_notices_col_period"),
        t("admin_community_notices_col_status"),
        t("admin_community_notices_col_pin"),
        t("admin_community_notices_col_created"),
        "",
      ]}>
        {notices.map((n) => {
          const pinnedNow = isPinnedNow(n);
          return (
            <tr key={n.id} className="border-b border-sam-border-soft">
              <td className={`${COMMUNITY_TD} max-w-[20rem]`}>
                <Link
                  href={communityDetailHref(`${COMMUNITY_POSTS_LIST_PATH}/${encodeURIComponent(n.id)}`, selfHref)}
                  className="line-clamp-2 font-medium text-sam-fg hover:underline"
                >
                  {String(n.title ?? "").trim() || t("admin_community_notices_no_title")}
                </Link>
                <span className="text-[12px] text-sam-muted">
                  {t("admin_community_notices_row_stats", { views: formatAdminNumber(n.view_count ?? 0), comments: formatAdminNumber(n.comment_count ?? 0) })}
                </span>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap text-sam-muted`}>{topicNameOf(n.topic_slug)}</td>
              <td className={`${COMMUNITY_TD} text-[12px]`}>
                <div>{t("admin_community_notices_start_at", { time: phtOrDash(n.notice_starts_at, t("admin_community_notices_start_now")) })}</div>
                <div>{t("admin_community_notices_end_at", { time: phtOrDash(n.notice_ends_at, t("common_none")) })}</div>
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
                <span className="block text-[12px] text-sam-fg">{n.author_label || t("admin_community_notices_ops_team")}</span>
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
                    {t("admin_community_notices_row_edit")}
                  </AdminActionButton>
                  {tab !== "ended" ? (
                    <AdminActionButton
                      variant="secondary"
                      size="sm"
                      disabled={!canContent}
                      title={noPermTitle}
                      onClick={() => {
                        setAlsoHide(false);
                        setEnding(n);
                      }}
                    >
                      {t("admin_community_notices_row_end")}
                    </AdminActionButton>
                  ) : pinnedNow ? (
                    // 행 버튼 2개 이하 — 게시 중·예약 공지의 고정 해제는 아래 「고정된 글」에서
                    <AdminActionButton variant="secondary" size="sm" disabled={!canContent} title={noPermTitle} onClick={() => setUnpinning(n)}>
                      {t("admin_community_notices_row_unpin")}
                    </AdminActionButton>
                  ) : null}
                </span>
              </td>
            </tr>
          );
        })}
      </CommunityTable>
      </>
    );

  const topicCountEntries = Object.entries(topicLimit.counts ?? {});

  const pinnedSection = (
    <section className="space-y-2" data-community-pinned-section="1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_community_notices_pinned_title")}</h2>
        <span className="flex flex-wrap gap-2 text-[12px]">
          <AdminToneBadge tone={feedLimit.count >= feedLimit.limit ? "warning" : "neutral"}>
            {t("admin_community_notices_feed_limit_badge", { count: feedLimit.count, limit: feedLimit.limit })}
          </AdminToneBadge>
          {topicCountEntries.map(([topicId, count]) => (
            <AdminToneBadge key={topicId} tone={count >= topicLimit.limit ? "warning" : "neutral"}>
              {topicNameById(topicId)} {count}/{topicLimit.limit}
            </AdminToneBadge>
          ))}
          {topicCountEntries.length === 0 ? (
            <span className="text-sam-muted">{t("admin_community_notices_pin_limit", { n: topicLimit.limit })}</span>
          ) : null}
        </span>
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        {loading && !data ? (
          <AdminLoadingState ko={ko} />
        ) : loadErr && !data ? null : pinned.length === 0 ? (
          <AdminEmptyState ko={ko} message={t("admin_community_notices_pinned_empty")} />
        ) : (
          <CommunityTable head={[
            t("admin_community_notices_col_title"),
            t("admin_community_notices_col_scope"),
            t("admin_community_notices_col_category"),
            t("admin_community_notices_col_pin_ends"),
            t("admin_community_notices_col_pinned_by"),
            "",
          ]}>
            {pinned.map((p) => (
              <tr key={p.id} className="border-b border-sam-border-soft">
                <td className={`${COMMUNITY_TD} max-w-[20rem]`}>
                  <Link
                    href={communityDetailHref(`${COMMUNITY_POSTS_LIST_PATH}/${encodeURIComponent(p.id)}`, selfHref)}
                    className="line-clamp-2 font-medium text-sam-fg hover:underline"
                  >
                    {String(p.title ?? "").trim() || t("admin_community_notices_no_title")}
                  </Link>
                  {p.is_notice ? <AdminToneBadge tone="progress">{t("admin_community_notices_notice_badge")}</AdminToneBadge> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="pin_scope" value={p.pin_scope} ko={ko} />
                </td>
                <td className={`${COMMUNITY_TD} text-sam-muted`}>{topicNameOf(p.topic_slug)}</td>
                <td className={`${COMMUNITY_TD} text-[12px]`}>{phtOrDash(p.pinned_until, t("admin_community_notices_no_deadline"))}</td>
                <td className={`${COMMUNITY_TD} text-[12px]`}>
                  {p.pinned_by_label || t("admin_community_notices_admin")}
                  {p.pin_reason ? <span className="block text-sam-muted">{p.pin_reason}</span> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionButton variant="secondary" size="sm" disabled={!canContent} title={noPermTitle} onClick={() => setUnpinning(p)}>
                    {t("admin_community_notices_pinned_unpin")}
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
        title={t("admin_community_notices_title")}
        description={t("admin_community_notices_desc")}
        actions={
          <>
            <AdminActionLink href="/admin/app/notices" variant="quiet">
              {t("admin_community_notices_link_app_notices")}
            </AdminActionLink>
            <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
              {t("admin_community_notices_reload")}
            </AdminActionButton>
            <AdminActionButton
              variant="primary"
              disabled={!canContent}
              title={noPermTitle}
              onClick={() => setEditor({ ...EMPTY_EDITOR })}
            >
              {t("admin_community_notices_compose")}
            </AdminActionButton>
          </>
        }
        banner={<AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />}
        tabs={
          <CommunityTabs
            tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey), count: x.value === tab && !loading && !loadErr ? total : null }))}
            value={tab}
            onChange={(v) => set({ tab: v === "live" ? null : v })}
          />
        }
        footer={
          total !== null && total > 0 ? (
            <CommunityPagination
              page={page}
              pageSize={size}
              total={total}
              onPage={(p) => set({ page: p })}
              onPageSize={(n) => set({ size: n })}
              disabled={loading}
            />
          ) : null
        }
      >
        {body}
      </CommunityListShell>

      {pinnedSection}

      {ed ? (
        <CommunityActionSheet
          title={ed.mode === "create" ? t("admin_community_notices_sheet_create") : t("admin_community_notices_sheet_edit")}
          rows={[
            { label: t("admin_community_notices_col_title"), value: ed.title.trim() || "—" },
            { label: t("admin_community_notices_col_category"), value: edTopic?.name ?? t("admin_community_notices_select_required") },
            {
              label: t("admin_community_notices_row_period"),
              value: `${ed.startsAt ? `${ed.startsAt.replace("T", " ")} PHT` : t("admin_community_notices_start_immediately")} ~ ${
                ed.endsAt ? `${ed.endsAt.replace("T", " ")} PHT` : t("admin_community_notices_no_end_time")
              }`,
            },
            ...(ed.mode === "create"
              ? [
                  {
                    label: t("admin_community_notices_row_pin"),
                    value: ed.pin
                      ? ed.pinScope === "feed"
                        ? t("admin_community_notices_pin_feed")
                        : t("admin_community_notices_pin_topic")
                      : t("admin_community_notices_pin_none"),
                  },
                ]
              : []),
          ]}
          notice={t("admin_community_notices_editor_notice")}
          reason={null}
          ready={edReady && !edWindowBad}
          confirmLabel={ed.mode === "create" ? t("admin_community_notices_publish_button") : t("admin_community_notices_save_button")}
          onSubmit={() => submitEditor(ed)}
          onClose={() => setEditor(null)}
          onSettled={(k) => {
            setEditor(null);
            settle(k, ed.mode === "create" ? t("admin_community_notices_published") : t("admin_community_notices_updated"));
          }}
        >
          <div className="space-y-3 text-[13px]">
            <label className="block space-y-1">
              <span className="font-semibold text-sam-fg">{t("admin_community_notices_field_title")}</span>
              <input className={FIELD} value={ed.title} onChange={(e) => setEditor({ ...ed, title: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold text-sam-fg">{t("admin_community_notices_field_body")}</span>
              <textarea
                className={`${FIELD} min-h-[160px]`}
                value={ed.content}
                onChange={(e) => setEditor({ ...ed, content: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold text-sam-fg">{t("admin_community_notices_field_category")}</span>
              <select className={FIELD} value={ed.topicId} onChange={(e) => setEditor({ ...ed, topicId: e.target.value })}>
                <option value="">{t("admin_community_notices_select_category")}</option>
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
                <span className="font-semibold text-sam-fg">{t("admin_community_notices_field_starts")}</span>
                <input
                  type="datetime-local"
                  className={FIELD}
                  value={ed.startsAt}
                  onChange={(e) => setEditor({ ...ed, startsAt: e.target.value })}
                />
                <span className="sam-text-xxs text-sam-muted">{t("admin_community_notices_starts_hint")}</span>
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-sam-fg">{t("admin_community_notices_field_ends")}</span>
                <input
                  type="datetime-local"
                  className={FIELD}
                  value={ed.endsAt}
                  onChange={(e) => setEditor({ ...ed, endsAt: e.target.value })}
                />
                <span className="sam-text-xxs text-sam-muted">{t("admin_community_notices_ends_hint")}</span>
              </label>
            </div>
            {edWindowBad ? <p className="text-[12px] text-sam-danger">{t("admin_community_notices_window_invalid")}</p> : null}
            {ed.mode === "create" ? (
              <fieldset className="space-y-1 rounded-ui-rect border border-sam-border p-2">
                <label className="flex items-center gap-2 font-semibold text-sam-fg">
                  <input type="checkbox" checked={ed.pin} onChange={(e) => setEditor({ ...ed, pin: e.target.checked })} />
                  {t("admin_community_notices_editor_pin")}
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
                      {t("admin_community_notices_pin_scope_feed", { count: feedLimit.count, limit: feedLimit.limit })}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="notice-pin-scope"
                        checked={ed.pinScope === "topic"}
                        onChange={() => setEditor({ ...ed, pinScope: "topic" })}
                      />
                      {t("admin_community_notices_pin_scope_topic_only", {
                        usage: edTopic ? `${topicLimit.counts?.[edTopic.id] ?? 0}/${topicLimit.limit}` : t("admin_community_notices_topic_max", { n: topicLimit.limit }),
                      })}
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sam-muted">{t("admin_community_notices_field_pin_ends")}</span>
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
          title={t("admin_community_notices_end_title")}
          rows={[
            { label: t("admin_community_notices_row_notice"), value: `「${String(ending.title ?? "").slice(0, 40)}」` },
            {
              label: t("admin_community_notices_row_action"),
              value: alsoHide ? t("admin_community_notices_end_hide") : t("admin_community_notices_end_keep"),
            },
          ]}
          notice={t("admin_community_notices_end_notice")}
          reason={alsoHide ? { minLength: 2, placeholder: t("admin_community_notices_hide_reason") } : null}
          confirmLabel={t("admin_community_notices_end_button")}
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
              }),
              language
            )
          }
          onClose={() => setEnding(null)}
          onSettled={(k) => {
            setEnding(null);
            settle(k, t("admin_community_notices_ended"));
          }}
        >
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={alsoHide} onChange={(e) => setAlsoHide(e.target.checked)} />
            {t("admin_community_notices_also_hide_post")}
          </label>
        </CommunityActionSheet>
      ) : null}

      {unpinning ? (
        <CommunityActionSheet
          title={t("admin_community_notices_unpin_title")}
          rows={[
            { label: t("admin_community_notices_row_post"), value: `「${String(unpinning.title ?? "").slice(0, 40)}」` },
            { label: t("admin_community_notices_col_scope"), value: adminCommunityLabel("pin_scope", unpinning.pin_scope, ko).label },
          ]}
          notice={t("admin_community_notices_unpin_notice")}
          reason={null}
          confirmLabel={t("admin_community_notices_unpin_button")}
          onSubmit={async () =>
            toCommunitySheetResult(
              await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(unpinning.id)}/pin`, {
                method: "DELETE",
                body: {},
              }),
              language
            )
          }
          onClose={() => setUnpinning(null)}
          onSettled={(k) => {
            setUnpinning(null);
            settle(k, t("admin_community_notices_unpinned"));
          }}
        />
      ) : null}
    </div>
  );
}
