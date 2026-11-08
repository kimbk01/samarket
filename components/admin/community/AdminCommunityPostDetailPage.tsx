"use client";

/**
 * 커뮤니티 게시글 상세 (설계 §C-6 · §C-0-1 상세 페이지 틀).
 * ① 대상 요약 카드 → ③ 조치 버튼(상태·권한 기준) → 탭(본문 편집 / 수정 이력 / 신고·조치 기록) → ④ 기술 정보.
 * 모든 변경은 GET 의 updated_at 을 expectedUpdatedAt 으로 보낸다 (409 → 최신 내용 다시 불러오기).
 * 숨기기·삭제·수정 저장은 L2(사유 필수), 다시 공개·고정 해제는 L1, 상단 고정은 범위·기간·사유 시트.
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import { CommunityPromotionFaultPicker } from "@/components/admin/community/kit/CommunityPromotionFaultPicker";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTabs,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { invalidateCommunityFeedCachesAfterPostModeration } from "@/lib/community/invalidate-community-author-posts-client";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import type { ImportedContentBlock } from "@/lib/community/imported-content-blocks";
import {
  COMMUNITY_POSTS_LIST_PATH,
  communityJsonFetch,
  manilaLocalInputToUtcIso,
  toCommunitySheetResult,
  useCommunityTopicOptions,
  useTopicNameOf,
  type CommunityBanner,
} from "@/components/admin/community/posts/community-post-admin-shared";
import {
  CommunityPostBlocksEditor,
  normalizeEditedBlocks,
} from "@/components/admin/community/posts/CommunityPostBlocksEditor";
import { CommunityPostRevisionsTab } from "@/components/admin/community/posts/CommunityPostRevisionsTab";
import { CommunityPostRecordsTab } from "@/components/admin/community/posts/CommunityPostRecordsTab";

type RunningPromotion = { id: string; userId?: string | null; orderStatus?: string | null; endAt?: string | null };

type PostDetail = {
  id: string;
  user_id?: string | null;
  topic_id?: string | null;
  topic_slug?: string | null;
  category?: string | null;
  title?: string | null;
  content?: string | null;
  content_blocks?: unknown;
  status?: string | null;
  origin_kind?: string | null;
  display_author_name?: string | null;
  public_attribution_name?: string | null;
  public_attribution_url?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  report_count?: number | null;
  created_at?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  moderated_at?: string | null;
  moderation_reason?: string | null;
  moderated_by_label?: string | null;
  last_edited_role?: string | null;
  last_edit_reason?: string | null;
  last_admin_edit_at?: string | null;
  last_edited_by_label?: string | null;
  is_notice?: boolean | null;
  notice_starts_at?: string | null;
  notice_ends_at?: string | null;
  pinned_at?: string | null;
  pinned_until?: string | null;
  pin_scope?: string | null;
  pin_reason?: string | null;
  pinned_by_label?: string | null;
  is_pinned_now?: boolean | null;
  author_label?: string | null;
  author_nickname?: string | null;
  author_username?: string | null;
  images?: Array<{ id: string; url: string; sort_order: number }>;
  running_promotions?: RunningPromotion[];
};

type Sheet = "hide" | "delete" | "restore" | "save" | "pin" | "unpin" | "image_delete" | null;
type DetailTab = "edit" | "revisions" | "records";

const FIELD =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary disabled:opacity-60";

function pht(iso: string | null | undefined): string {
  return iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—";
}

function asBlocks(raw: unknown): ImportedContentBlock[] | null {
  return Array.isArray(raw) && raw.length > 0 ? (raw as ImportedContentBlock[]) : null;
}

export function AdminCommunityPostDetailPage({ postId }: { postId: string }) {
  const { t: tr, language } = useI18n();
  const ko = language !== "en";
  const id = postId.trim();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? COMMUNITY_POSTS_LIST_PATH;
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const noPermTitle = canContent ? undefined : tr("admin_community_comments_no_perm");
  const { topics } = useCommunityTopicOptions();
  const topicNameOf = useTopicNameOf(topics);

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [tab, setTab] = useState<DetailTab>("edit");
  const [childReload, setChildReload] = useState(0);

  // 편집 상태
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editBlocks, setEditBlocks] = useState<ImportedContentBlock[] | null>(null);
  const [editTopicId, setEditTopicId] = useState("");

  // 시트 추가 입력
  const [fault, setFault] = useState<"" | "operator" | "member">("");
  const [faultNeeded, setFaultNeeded] = useState(false);
  const [pinScope, setPinScope] = useState<"feed" | "topic">("feed");
  const [pinUntil, setPinUntil] = useState("");
  const [imageTarget, setImageTarget] = useState<{ id: string; url: string } | null>(null);

  const resetForm = useCallback((p: PostDetail) => {
    setEditTitle(String(p.title ?? ""));
    setEditContent(String(p.content ?? ""));
    setEditBlocks(p.origin_kind === "imported" ? asBlocks(p.content_blocks) : null);
    setEditTopicId(String(p.topic_id ?? ""));
  }, []);

  const load = useCallback(
    async (opts: { keepDraft?: boolean } = {}) => {
      if (!id) return;
      const r = await communityJsonFetch<{ post?: PostDetail }>(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`);
      if (!r.ok || !r.json.post) {
        setLoadErr({ code: r.ok ? "not_found" : r.code, status: r.ok ? 404 : r.status });
        setLoading(false);
        return;
      }
      setLoadErr(null);
      setPost(r.json.post);
      if (!opts.keepDraft) resetForm(r.json.post);
      setLoading(false);
      setChildReload((n) => n + 1);
    },
    [id, resetForm]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const isImported = post?.origin_kind === "imported";
  const blocksMode = isImported && editBlocks !== null;
  const original = useMemo(
    () => ({
      title: String(post?.title ?? ""),
      content: String(post?.content ?? ""),
      blocks: JSON.stringify(post?.origin_kind === "imported" ? asBlocks(post?.content_blocks) : null),
      topicId: String(post?.topic_id ?? ""),
    }),
    [post]
  );
  const titleChanged = editTitle !== original.title;
  const contentChanged = !blocksMode && editContent !== original.content;
  const blocksChanged = blocksMode && JSON.stringify(editBlocks) !== original.blocks;
  const topicChanged = editTopicId !== original.topicId;
  const dirty = titleChanged || contentChanged || blocksChanged || topicChanged;

  const promotions = post?.running_promotions ?? [];
  const showFault = promotions.length > 0 || faultNeeded;

  const openSheet = (s: Sheet) => {
    setFault("");
    setPinScope("feed");
    setPinUntil("");
    setSheet(s);
  };

  const settle = useCallback(
    (kind: CommunitySheetSettle, okMessage: string, opts: { keepDraft?: boolean; moderated?: boolean } = {}) => {
      setSheet(null);
      if (kind === "done") {
        setBanner({ ok: true, message: okMessage });
        if (opts.moderated) invalidateCommunityFeedCachesAfterPostModeration(id);
        void load({ keepDraft: false });
      } else if (kind === "stale") {
        setBanner({ ok: false, code: tr("admin_community_post_stale") });
        void load({ keepDraft: opts.keepDraft });
      } else {
        setBanner({ ok: false, code: tr("admin_community_post_gone") });
        void load();
      }
    },
    [id, load, tr]
  );

  const patchPost = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { expectedUpdatedAt: post?.updated_at ?? "", ...body },
      });
      if (!r.ok && r.code === "promotion_fault_required") {
        // D-10: 서버가 상위노출 중이라고 알려 오면 이 시트 안에서 귀책을 묻는다 (아래 선택지가 나타남).
        setFaultNeeded(true);
        return { ok: false, status: 400, code: tr("admin_community_postd_promotion_fault_needed") };
      }
      if (!r.ok && r.code === "promotion_end_failed") {
        // 상위노출 종료에 실패하면 서버가 글을 바꾸지 않는다 — 최신 상태(남은 주문)를 다시 읽는다.
        void load({ keepDraft: true });
      }
      return toCommunitySheetResult(r, language);
    },
    [id, language, post?.updated_at, load, tr]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <BackLink href={backHref} />
        <AdminLoadingState ko={ko} />
      </div>
    );
  }
  if (!post) {
    return (
      <div className="space-y-3">
        <BackLink href={backHref} />
        <AdminErrorState
          ko={ko}
          code={loadErr?.code === "not_found" ? "not_found" : loadErr?.code}
          httpStatus={loadErr?.status}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      </div>
    );
  }

  const status = String(post.status ?? "active");
  const title = String(post.title ?? "").trim() || tr("admin_community_comments_no_title");
  const slug = String(post.topic_slug ?? post.category ?? "").trim();
  const reportCount = Number(post.report_count ?? 0);
  const images = Array.isArray(post.images) ? post.images : [];
  const pinned = post.is_pinned_now === true;
  const selectedTopic = topics.find((t) => t.id === editTopicId);
  const editableTopics = topics.filter((t) => !t.allow_meetup && (t.is_active || t.id === original.topicId));

  const summaryRows: { label: string; value: ReactNode }[] = [
    {
      label: tr("admin_community_postd_row_origin"),
      value: <CommunityStatusBadge domain="origin_kind" value={post.origin_kind ?? "member"} ko={ko} />,
    },
    {
      label: tr("admin_community_comments_col_author"),
      value: (
        <span className="flex flex-col gap-0.5">
          <CommunityAuthorCell
            userId={post.user_id}
            nickname={post.author_nickname ?? post.author_label}
            handle={post.author_username}
            origin={post.origin_kind}
            sourceName={post.public_attribution_name}
          />
          {post.origin_kind !== "member" && post.display_author_name ? (
            <span className="sam-text-xxs text-sam-muted">
              {tr("admin_community_post_detail_display_name", { name: post.display_author_name })}
            </span>
          ) : null}
          {post.origin_kind === "admin" && post.author_label ? (
            <span className="sam-text-xxs text-sam-muted">
              {tr("admin_community_post_detail_admin_author", { name: post.author_label })}
            </span>
          ) : null}
        </span>
      ),
    },
    ...(isImported && post.public_attribution_url
      ? [
          {
            label: tr("admin_community_postd_row_original"),
            value: (
              <a href={post.public_attribution_url} target="_blank" rel="noreferrer" className="text-sam-info hover:underline">
                {post.public_attribution_name || tr("admin_community_postd_view_original")}
              </a>
            ),
          },
        ]
      : []),
    {
      label: tr("admin_community_comments_filter_topic"),
      value: slug ? (
        <Link href={`${COMMUNITY_POSTS_LIST_PATH}?topicSlug=${encodeURIComponent(slug)}`} className="text-sam-info hover:underline">
          {topicNameOf(slug)}
        </Link>
      ) : (
        "—"
      ),
    },
    { label: tr("admin_community_comments_col_status"), value: <CommunityStatusBadge domain="content_status" value={status} ko={ko} /> },
    { label: tr("admin_community_postd_row_published_at"), value: pht(post.published_at ?? post.created_at) },
    { label: tr("admin_community_comments_col_created"), value: pht(post.created_at) },
    { label: tr("admin_community_postd_row_updated_at"), value: pht(post.updated_at) },
    {
      label: tr("admin_community_reports_col_reports"),
      value: (
        <Link href={`/admin/community/reports?targetId=${encodeURIComponent(id)}`} className="text-sam-info hover:underline">
          {tr("admin_count_items", { n: formatAdminNumber(reportCount) })}
        </Link>
      ),
    },
    {
      label: tr("admin_community_postd_row_reactions"),
      value: (
        <span>
          {tr("admin_community_post_detail_likes_n", { n: formatAdminNumber(post.like_count ?? 0) })} ·{" "}
          <Link href={`/admin/community/comments?postId=${encodeURIComponent(id)}`} className="text-sam-info hover:underline">
            {tr("admin_community_post_detail_comments_n", { n: formatAdminNumber(post.comment_count ?? 0) })}
          </Link>{" "}
          · {tr("admin_community_post_detail_views_n", { n: formatAdminNumber(post.view_count ?? 0) })}
        </span>
      ),
    },
    {
      label: tr("admin_community_postd_row_last_action"),
      value: post.moderated_at ? (
        <span>
          {post.moderated_by_label || tr("admin_community_dash_admin_fallback")} · {pht(post.moderated_at)}
          {post.moderation_reason ? (
            <span className="block text-sam-muted">
              {tr("admin_community_post_detail_reason", { reason: post.moderation_reason })}
            </span>
          ) : null}
        </span>
      ) : (
        tr("admin_community_import_sources_none")
      ),
    },
    {
      label: tr("admin_community_postd_row_admin_edit"),
      value: post.last_admin_edit_at ? (
        <span>
          {post.last_edited_by_label || tr("admin_community_dash_admin_fallback")} · {pht(post.last_admin_edit_at)}
          {post.last_edit_reason ? (
            <span className="block text-sam-muted">
              {tr("admin_community_post_detail_reason", { reason: post.last_edit_reason })}
            </span>
          ) : null}
        </span>
      ) : (
        tr("admin_community_import_sources_none")
      ),
    },
    {
      label: tr("admin_community_postd_row_pin"),
      value: pinned ? (
        <span>
          <AdminToneBadge tone="progress">{adminCommunityLabel("pin_scope", post.pin_scope, ko).label}</AdminToneBadge>{" "}
          {post.pinned_until ? `~ ${pht(post.pinned_until)}` : tr("admin_community_postd_no_deadline")}
          <span className="block text-sam-muted">
            {post.pinned_by_label || tr("admin_community_dash_admin_fallback")}
            {post.pin_reason ? ` · ${tr("admin_community_postd_reason_inline", { reason: post.pin_reason })}` : ""}
          </span>
        </span>
      ) : (
        tr("admin_community_postd_not_pinned")
      ),
    },
    {
      label: tr("admin_community_postd_row_notice"),
      value: post.is_notice ? (
        <span>
          {tr("admin_community_post_detail_notice_label")} · {post.notice_starts_at ? pht(post.notice_starts_at) : tr("admin_community_postd_immediately")} ~{" "}
          {post.notice_ends_at ? pht(post.notice_ends_at) : tr("admin_community_postd_no_end_time")}{" "}
          <Link href="/admin/community/notices" className="text-sam-info hover:underline">
            {tr("admin_community_post_detail_link_notices")}
          </Link>
        </span>
      ) : (
        tr("admin_community_postd_not_notice")
      ),
    },
    {
      label: tr("admin_community_postd_row_promotion"),
      value:
        promotions.length > 0 ? (
          <span className="flex flex-col gap-0.5">
            {promotions.map((p) => (
              <span key={p.id}>
                <AdminToneBadge tone={adminCommunityLabel("promotion_status", p.orderStatus, ko).tone}>
                  {adminCommunityLabel("promotion_status", p.orderStatus, ko).label}
                </AdminToneBadge>{" "}
                {p.endAt ? `~ ${pht(p.endAt)}` : ""}
              </span>
            ))}
            <Link href="/admin/community/promotions" className="text-sam-info hover:underline">
              {tr("admin_community_post_detail_link_promotions_view")}
            </Link>
          </span>
        ) : (
          <span>
            {tr("admin_community_post_detail_no_active_promotion")} ·{" "}
            <Link href="/admin/community/promotions" className="text-sam-info hover:underline">
              {tr("admin_community_post_detail_link_promotions")}
            </Link>
          </span>
        ),
    },
  ];

  const sheetRows = [
    { label: tr("admin_community_comments_col_post"), value: tr("admin_community_comments_row_quote", { text: title.slice(0, 40) }) },
    { label: tr("admin_community_comments_col_author"), value: post.origin_kind === "member" ? post.author_label || "—" : adminCommunityLabel("origin_kind", post.origin_kind, ko).label },
    { label: tr("admin_community_comments_row_status"), value: adminCommunityLabel("content_status", status, ko).label },
  ];

  const faultPicker = showFault ? (
    <CommunityPromotionFaultPicker value={fault} onChange={setFault} />
  ) : null;

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2" data-community-post-actions="1">
      {status === "active" ? (
        <AdminActionButton
          variant="secondary"
          className="border-sam-warning text-sam-fg"
          disabled={!canContent || !!sheet}
          title={noPermTitle}
          onClick={() => openSheet("hide")}
        >
          {tr("admin_community_post_detail_act_hide")}
        </AdminActionButton>
      ) : (
        <AdminActionButton variant="secondary" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("restore")}>
          {status === "deleted" ? tr("admin_community_postd_restore_btn") : tr("admin_community_comments_action_restore")}
        </AdminActionButton>
      )}
      {status === "active" ? (
        pinned ? (
          <AdminActionButton variant="secondary" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("unpin")}>
            {tr("admin_community_post_detail_act_unpin")}
          </AdminActionButton>
        ) : (
          <AdminActionButton variant="secondary" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("pin")}>
            {tr("admin_community_post_detail_act_pin")}
          </AdminActionButton>
        )
      ) : null}
      {status !== "deleted" ? (
        <AdminActionButton variant="danger" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("delete")}>
          {tr("admin_community_post_detail_act_delete")}
        </AdminActionButton>
      ) : null}
      <a
        href={`/philife/${encodeURIComponent(id)}`}
        target="_blank"
        rel="noreferrer"
        className="ml-auto text-[13px] font-medium text-sam-info hover:underline"
      >
        {tr("admin_community_view_on_site")}
      </a>
    </div>
  );

  const saveBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    if (titleChanged) body.title = editTitle.trim();
    if (contentChanged) body.content = editContent;
    if (blocksChanged && editBlocks) body.contentBlocks = normalizeEditedBlocks(editBlocks);
    if (topicChanged && selectedTopic) {
      body.topicId = selectedTopic.id;
      body.topicSlug = selectedTopic.slug;
    }
    return body;
  };

  const editTab = (
    <div className="space-y-3" data-community-post-edit="1">
      {isImported ? (
        <p className="rounded-ui-rect border border-sam-info bg-sam-info-soft px-3 py-2 text-[13px] text-sam-fg">
          {tr("admin_community_post_detail_imported_edit_notice")}
        </p>
      ) : null}
      {!isImported && post?.content_blocks != null ? (
        <p
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-fg"
          data-community-post-rich-notice="1"
        >
          {tr("admin_community_post_detail_rich_text_notice")}
        </p>
      ) : null}
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-sam-muted">{tr("admin_community_post_detail_field_title")}</span>
        <input className={FIELD} value={editTitle} disabled={!canContent} onChange={(e) => setEditTitle(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-sam-muted">{tr("admin_community_post_detail_field_category")}</span>
        <select className={FIELD} value={editTopicId} disabled={!canContent || topics.length === 0} onChange={(e) => setEditTopicId(e.target.value)}>
          {!editableTopics.some((t) => t.id === editTopicId) ? <option value={editTopicId}>{topicNameOf(slug)}</option> : null}
          {editableTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-1">
        <span className="text-[12px] font-medium text-sam-muted">{tr("admin_community_post_detail_field_body")}</span>
        {blocksMode && editBlocks ? (
          <CommunityPostBlocksEditor blocks={editBlocks} onChange={setEditBlocks} disabled={!canContent} />
        ) : (
          <textarea
            className={`${FIELD} min-h-[260px]`}
            value={editContent}
            disabled={!canContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        )}
      </div>
      {images.length > 0 ? (
        <div className="space-y-1">
          <span className="text-[12px] font-medium text-sam-muted">
            {tr("admin_community_post_images_heading", { count: images.length })}
          </span>
          <div className="flex flex-wrap gap-2" data-community-post-images="1">
            {images.map((img) => (
              <div key={img.id || img.url} className="flex w-24 flex-col gap-1">
                <div className="h-24 w-24 overflow-hidden rounded-ui-rect border border-sam-border">
                  <SamarketThumbnail src={img.url} alt="" className="h-full w-full" size={96} />
                </div>
                {img.id ? (
                  <AdminActionButton
                    variant="danger"
                    className="w-full px-1 text-[12px]"
                    disabled={!canContent || !!sheet || dirty}
                    title={noPermTitle ?? (dirty ? tr("admin_community_post_image_delete_dirty") : undefined)}
                    onClick={() => {
                      setImageTarget({ id: img.id, url: img.url });
                      openSheet("image_delete");
                    }}
                  >
                    {tr("admin_community_post_image_delete")}
                  </AdminActionButton>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div
        className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-2 border-t border-sam-border bg-sam-surface px-1 py-2"
        data-community-post-edit-footer="1"
      >
        <AdminActionButton variant="neutral" disabled={!dirty || !!sheet} onClick={() => resetForm(post)}>
          {tr("admin_community_post_detail_edit_cancel")}
        </AdminActionButton>
        <span className="text-[12px] text-sam-muted">{dirty ? tr("admin_community_postd_unsaved") : tr("admin_community_settings_no_change")}</span>
        <AdminActionButton
          variant="primary"
          disabled={!canContent || !dirty || !editTitle.trim() || !!sheet}
          title={noPermTitle}
          onClick={() => openSheet("save")}
        >
          {tr("admin_community_post_detail_edit_save")}
        </AdminActionButton>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pb-4" data-community-admin-detail="post">
      <BackLink href={backHref} />
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="sam-text-page-title min-w-0 font-semibold text-sam-fg [overflow-wrap:anywhere]">{title}</h1>
        <span className="flex gap-1">
          <CommunityStatusBadge domain="content_status" value={status} ko={ko} />
          {post.is_notice ? <AdminToneBadge tone="progress">{tr("admin_community_posts_badge_notice")}</AdminToneBadge> : null}
          {pinned ? <AdminToneBadge tone="progress">{tr("admin_community_posts_badge_pinned")}</AdminToneBadge> : null}
        </span>
      </header>
      <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />
      <CommunitySummaryCard rows={summaryRows} />
      {actionButtons}

      <CommunityTabs
        tabs={[
          { value: "edit", label: tr("admin_community_postd_tab_edit") },
          { value: "revisions", label: tr("admin_community_postd_tab_revisions") },
          { value: "records", label: tr("admin_community_postd_tab_records") },
        ]}
        value={tab}
        onChange={(v) => setTab(v as DetailTab)}
      />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        {tab === "edit" ? editTab : null}
        {tab === "revisions" ? (
          <CommunityPostRevisionsTab
            postId={id}
            current={{
              title: original.title,
              content: original.content,
              content_blocks: post.content_blocks,
              topic_slug: slug,
            }}
            topicNameOf={topicNameOf}
            reloadKey={childReload}
          />
        ) : null}
        {tab === "records" ? <CommunityPostRecordsTab postId={id} reportCount={reportCount} reloadKey={childReload} /> : null}
      </div>

      <AdminTechDetails ko={ko}>
        <div>{tr("admin_community_post_detail_tech_post_id", { id })}</div>
        {post.user_id ? <div>{tr("admin_community_post_detail_tech_author_id", { id: post.user_id })}</div> : null}
        {post.topic_id ? (
          <div>{tr("admin_community_post_detail_tech_topic_id", { id: post.topic_id, slug })}</div>
        ) : null}
        <div>{tr("admin_community_post_detail_tech_origin", { value: String(post.origin_kind ?? "") })}</div>
        <div>{tr("admin_community_post_detail_tech_version", { value: String(post.updated_at ?? "") })}</div>
      </AdminTechDetails>

      {sheet === "hide" || sheet === "delete" ? (
        <CommunityActionSheet
          title={sheet === "hide" ? tr("admin_community_postd_hide_title") : tr("admin_community_postd_delete_title")}
          rows={sheetRows}
          notice={
            sheet === "hide"
              ? tr("admin_community_postd_notice_hide")
              : tr("admin_community_postd_notice_delete")
          }
          reason={{ minLength: 2, placeholder: tr("admin_community_postd_reason_placeholder_moderate") }}
          ready={!showFault || fault !== ""}
          destructive={sheet === "delete"}
          confirmLabel={sheet === "hide" ? tr("admin_community_comments_action_hide") : tr("admin_community_comments_action_delete")}
          onSubmit={(reason) =>
            patchPost({
              status: sheet === "hide" ? "hidden" : "deleted",
              reason,
              ...(fault ? { promotionFault: fault } : {}),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, sheet === "hide" ? tr("admin_community_postd_hidden_msg") : tr("admin_community_postd_deleted_msg"), { moderated: true, keepDraft: true })}
        >
          {faultPicker}
        </CommunityActionSheet>
      ) : null}
      {sheet === "restore" ? (
        <CommunityActionSheet
          title={status === "deleted" ? tr("admin_community_postd_restore_title") : tr("admin_community_postd_reopen_title")}
          rows={sheetRows}
          notice={tr("admin_community_postd_notice_restore")}
          reason={null}
          confirmLabel={status === "deleted" ? tr("admin_community_postd_restore_btn") : tr("admin_community_comments_action_restore")}
          onSubmit={() => patchPost({ status: "active" })}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, tr("admin_community_postd_reopened_msg"), { keepDraft: true })}
        />
      ) : null}
      {sheet === "save" ? (
        <CommunityActionSheet
          title={tr("admin_community_post_detail_save_title")}
          rows={[
            ...sheetRows.slice(0, 1),
            {
              label: tr("admin_community_postd_row_changes"),
              value: [
                titleChanged ? tr("admin_community_postd_field_title") : "",
                contentChanged || blocksChanged ? tr("admin_community_postd_field_body") : "",
                topicChanged ? tr("admin_community_comments_filter_topic") : "",
              ]
                .filter(Boolean)
                .join(", "),
            },
          ]}
          notice={tr("admin_community_postd_notice_save")}
          reason={{ minLength: 2, placeholder: tr("admin_community_postd_reason_placeholder_edit") }}
          confirmLabel={tr("admin_community_postd_save_btn")}
          onSubmit={(reason) => patchPost({ ...saveBody(), reason })}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, tr("admin_community_postd_saved_msg"), { keepDraft: true })}
        />
      ) : null}
      {sheet === "image_delete" && imageTarget ? (
        <CommunityActionSheet
          title={tr("admin_community_post_image_delete_title")}
          rows={[
            ...sheetRows.slice(0, 2),
            {
              label: tr("admin_community_post_image_delete_target"),
              value: (
                <span className="inline-block h-16 w-16 overflow-hidden rounded-ui-rect border border-sam-border align-middle">
                  <SamarketThumbnail src={imageTarget.url} alt="" className="h-full w-full" size={64} />
                </span>
              ),
            },
          ]}
          notice={tr("admin_community_post_image_delete_notice")}
          reason={{ minLength: 2, placeholder: tr("admin_community_post_image_delete_reason_placeholder") }}
          destructive
          confirmLabel={tr("admin_community_post_image_delete")}
          onSubmit={async (reason) => {
            const r = await communityJsonFetch(
              `/api/admin/community/engine/posts/${encodeURIComponent(id)}/images/${encodeURIComponent(imageTarget.id)}`,
              { method: "DELETE", body: { expectedUpdatedAt: post?.updated_at ?? "", reason } }
            );
            return toCommunitySheetResult(r, language);
          }}
          onClose={() => {
            setSheet(null);
            setImageTarget(null);
          }}
          onSettled={(k) => {
            setImageTarget(null);
            settle(k, tr("admin_community_post_image_delete_done"), { moderated: true });
          }}
        />
      ) : null}
      {sheet === "pin" ? (
        <CommunityActionSheet
          title={tr("admin_community_posts_badge_pinned")}
          rows={sheetRows.slice(0, 2)}
          notice={tr("admin_community_post_detail_pin_notice")}
          reason={{ minLength: 2, placeholder: tr("admin_community_post_detail_pin_reason_placeholder") }}
          ready={pinScope === "feed" || Boolean(slug)}
          confirmLabel={tr("admin_community_posts_badge_pinned")}
          onSubmit={async (reason) => {
            const until = pinUntil ? manilaLocalInputToUtcIso(pinUntil) : null;
            const r = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}/pin`, {
              method: "POST",
              body: { scope: pinScope, until, reason },
            });
            return toCommunitySheetResult(r, language);
          }}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, tr("admin_community_post_detail_pinned_done"), { keepDraft: true })}
        >
          <fieldset className="space-y-1 text-[13px]">
            <legend className="font-semibold text-sam-fg">{tr("admin_community_post_detail_pin_scope")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="pin-scope" checked={pinScope === "feed"} onChange={() => setPinScope("feed")} />
              {tr("admin_community_post_detail_pin_scope_feed")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pin-scope"
                checked={pinScope === "topic"}
                disabled={!slug}
                onChange={() => setPinScope("topic")}
              />
              {tr("admin_community_post_detail_pin_scope_topic", { topic: topicNameOf(slug) })}
            </label>
          </fieldset>
          <label className="block space-y-1 text-[13px]">
            <span className="font-semibold text-sam-fg">{tr("admin_community_post_detail_pin_until")}</span>
            <input type="datetime-local" className={FIELD} value={pinUntil} onChange={(e) => setPinUntil(e.target.value)} />
          </label>
        </CommunityActionSheet>
      ) : null}
      {sheet === "unpin" ? (
        <CommunityActionSheet
          title={tr("admin_community_post_detail_unpin")}
          rows={sheetRows.slice(0, 1)}
          notice={tr("admin_community_post_detail_unpin_notice")}
          reason={null}
          confirmLabel={tr("admin_community_post_detail_unpin")}
          onSubmit={async () => {
            const r = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}/pin`, {
              method: "DELETE",
              body: {},
            });
            return toCommunitySheetResult(r, language);
          }}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, tr("admin_community_post_detail_unpinned_done"), { keepDraft: true })}
        />
      ) : null}
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  const { t: tr } = useI18n();
  return (
    <Link href={href} className="inline-block text-[13px] font-medium text-sam-muted hover:text-sam-fg hover:underline">
      {tr("admin_community_post_detail_back_to_list")}
    </Link>
  );
}
