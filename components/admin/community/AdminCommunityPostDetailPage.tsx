"use client";

/**
 * 커뮤니티 게시글 상세 (설계 §C-6 · §C-0-1 상세 페이지 틀).
 * ① 대상 요약 카드 → ③ 조치 버튼(상태·권한 기준) → 탭(본문 편집 / 수정 이력 / 신고·조치 기록) → ④ 기술 정보.
 * 모든 변경은 GET 의 updated_at 을 expectedUpdatedAt 으로 보낸다 (409 → 최신 내용 다시 불러오기).
 * 숨기기·삭제·수정 저장은 L2(사유 필수), 다시 공개·고정 해제는 L1, 상단 고정은 범위·기간·사유 시트.
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
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
  COMMUNITY_GONE_MESSAGE,
  COMMUNITY_POSTS_LIST_PATH,
  COMMUNITY_STALE_MESSAGE,
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
  const noPermTitle = canContent ? undefined : "권한 필요: 게시판 관리";
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
        setBanner({ ok: false, code: COMMUNITY_STALE_MESSAGE });
        void load({ keepDraft: opts.keepDraft });
      } else {
        setBanner({ ok: false, code: COMMUNITY_GONE_MESSAGE });
        void load();
      }
    },
    [id, load]
  );

  const patchPost = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { expectedUpdatedAt: post?.updated_at ?? "", ...body },
      });
      if (!r.ok && r.code === "promotion_fault_required") setFaultNeeded(true);
      return toCommunitySheetResult(r);
    },
    [id, post?.updated_at]
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
  const title = String(post.title ?? "").trim() || "제목 없음";
  const slug = String(post.topic_slug ?? post.category ?? "").trim();
  const reportCount = Number(post.report_count ?? 0);
  const images = Array.isArray(post.images) ? post.images : [];
  const pinned = post.is_pinned_now === true;
  const selectedTopic = topics.find((t) => t.id === editTopicId);
  const editableTopics = topics.filter((t) => !t.allow_meetup && (t.is_active || t.id === original.topicId));

  const summaryRows: { label: string; value: ReactNode }[] = [
    {
      label: "작성 구분",
      value: <CommunityStatusBadge domain="origin_kind" value={post.origin_kind ?? "member"} ko={ko} />,
    },
    {
      label: "작성자",
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
            <span className="sam-text-xxs text-sam-muted">화면 표시 이름: {post.display_author_name}</span>
          ) : null}
          {post.origin_kind === "admin" && post.author_label ? (
            <span className="sam-text-xxs text-sam-muted">작성 관리자: {post.author_label}</span>
          ) : null}
        </span>
      ),
    },
    ...(isImported && post.public_attribution_url
      ? [
          {
            label: "원문",
            value: (
              <a href={post.public_attribution_url} target="_blank" rel="noreferrer" className="text-sam-info hover:underline">
                {post.public_attribution_name || "원문 보기"}
              </a>
            ),
          },
        ]
      : []),
    {
      label: "카테고리",
      value: slug ? (
        <Link href={`${COMMUNITY_POSTS_LIST_PATH}?topicSlug=${encodeURIComponent(slug)}`} className="text-sam-info hover:underline">
          {topicNameOf(slug)}
        </Link>
      ) : (
        "—"
      ),
    },
    { label: "상태", value: <CommunityStatusBadge domain="content_status" value={status} ko={ko} /> },
    { label: "게시 시각", value: pht(post.published_at ?? post.created_at) },
    { label: "작성 시각", value: pht(post.created_at) },
    { label: "마지막 수정", value: pht(post.updated_at) },
    {
      label: "신고",
      value: (
        <Link href={`/admin/community/reports?targetId=${encodeURIComponent(id)}`} className="text-sam-info hover:underline">
          {formatAdminNumber(reportCount)}건
        </Link>
      ),
    },
    {
      label: "반응",
      value: (
        <span>
          좋아요 {formatAdminNumber(post.like_count ?? 0)} ·{" "}
          <Link href={`/admin/community/comments?postId=${encodeURIComponent(id)}`} className="text-sam-info hover:underline">
            댓글 {formatAdminNumber(post.comment_count ?? 0)}
          </Link>{" "}
          · 조회 {formatAdminNumber(post.view_count ?? 0)}
        </span>
      ),
    },
    {
      label: "마지막 조치",
      value: post.moderated_at ? (
        <span>
          {post.moderated_by_label || "관리자"} · {pht(post.moderated_at)}
          {post.moderation_reason ? <span className="block text-sam-muted">사유: {post.moderation_reason}</span> : null}
        </span>
      ) : (
        "없음"
      ),
    },
    {
      label: "관리자 수정",
      value: post.last_admin_edit_at ? (
        <span>
          {post.last_edited_by_label || "관리자"} · {pht(post.last_admin_edit_at)}
          {post.last_edit_reason ? <span className="block text-sam-muted">사유: {post.last_edit_reason}</span> : null}
        </span>
      ) : (
        "없음"
      ),
    },
    {
      label: "상단 고정",
      value: pinned ? (
        <span>
          <AdminToneBadge tone="progress">{adminCommunityLabel("pin_scope", post.pin_scope, ko).label}</AdminToneBadge>{" "}
          {post.pinned_until ? `~ ${pht(post.pinned_until)}` : "기한 없음"}
          <span className="block text-sam-muted">
            {post.pinned_by_label || "관리자"}
            {post.pin_reason ? ` · 사유: ${post.pin_reason}` : ""}
          </span>
        </span>
      ) : (
        "고정 안 됨"
      ),
    },
    {
      label: "공지",
      value: post.is_notice ? (
        <span>
          공지 · {post.notice_starts_at ? pht(post.notice_starts_at) : "바로"} ~{" "}
          {post.notice_ends_at ? pht(post.notice_ends_at) : "종료 시각 없음"}{" "}
          <Link href="/admin/community/notices" className="text-sam-info hover:underline">
            공지·고정 화면
          </Link>
        </span>
      ) : (
        "아님"
      ),
    },
    {
      label: "홍보",
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
              홍보 화면에서 보기
            </Link>
          </span>
        ) : (
          <span>
            노출 중인 홍보 없음 ·{" "}
            <Link href="/admin/community/promotions" className="text-sam-info hover:underline">
              홍보 화면
            </Link>
          </span>
        ),
    },
  ];

  const sheetRows = [
    { label: "게시글", value: `「${title.slice(0, 40)}」` },
    { label: "작성자", value: post.origin_kind === "member" ? post.author_label || "—" : adminCommunityLabel("origin_kind", post.origin_kind, ko).label },
    { label: "현재 상태", value: adminCommunityLabel("content_status", status, ko).label },
  ];

  const faultPicker = showFault ? (
    <fieldset className="space-y-1 rounded-ui-rect border border-sam-border p-2 text-[13px]">
      <legend className="px-1 font-semibold text-sam-fg">홍보 귀책 (필수)</legend>
      <p className="text-[12px] text-sam-muted">이 글에 노출 중인 홍보가 있습니다. 숨기거나 삭제하면 홍보도 종료됩니다.</p>
      <label className="flex items-center gap-2">
        <input type="radio" name="promotion-fault" checked={fault === "operator"} onChange={() => setFault("operator")} />
        운영 사유 (남은 기간 환급)
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name="promotion-fault" checked={fault === "member"} onChange={() => setFault("member")} />
        회원 사유 (환급 없음)
      </label>
    </fieldset>
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
          숨기기
        </AdminActionButton>
      ) : (
        <AdminActionButton variant="secondary" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("restore")}>
          {status === "deleted" ? "복구" : "다시 공개"}
        </AdminActionButton>
      )}
      {status === "active" ? (
        pinned ? (
          <AdminActionButton variant="secondary" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("unpin")}>
            고정 해제
          </AdminActionButton>
        ) : (
          <AdminActionButton variant="secondary" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("pin")}>
            상단 고정
          </AdminActionButton>
        )
      ) : null}
      {status !== "deleted" ? (
        <AdminActionButton variant="danger" disabled={!canContent || !!sheet} title={noPermTitle} onClick={() => openSheet("delete")}>
          삭제
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
          외부 수집 글은 블록 단위로 수정합니다. 원문 출처 표시는 그대로 유지됩니다.
        </p>
      ) : null}
      {!isImported && post?.content_blocks != null ? (
        <p
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-fg"
          data-community-post-rich-notice="1"
        >
          회원이 서식(제목·굵게·목록·표·사진 설명 등)으로 쓴 글입니다. 본문을 고쳐 저장하면 서식이 해제되고 아래 평문으로 저장됩니다.
          (이전 서식은 수정 이력에 남습니다)
        </p>
      ) : null}
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-sam-muted">제목</span>
        <input className={FIELD} value={editTitle} disabled={!canContent} onChange={(e) => setEditTitle(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-sam-muted">카테고리</span>
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
        <span className="text-[12px] font-medium text-sam-muted">본문</span>
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
          취소
        </AdminActionButton>
        <span className="text-[12px] text-sam-muted">{dirty ? "저장하지 않은 변경이 있습니다" : "변경 없음"}</span>
        <AdminActionButton
          variant="primary"
          disabled={!canContent || !dirty || !editTitle.trim() || !!sheet}
          title={noPermTitle}
          onClick={() => openSheet("save")}
        >
          수정 저장
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
          {post.is_notice ? <AdminToneBadge tone="progress">공지</AdminToneBadge> : null}
          {pinned ? <AdminToneBadge tone="progress">상단 고정</AdminToneBadge> : null}
        </span>
      </header>
      <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />
      <CommunitySummaryCard rows={summaryRows} />
      {actionButtons}

      <CommunityTabs
        tabs={[
          { value: "edit", label: "본문 편집" },
          { value: "revisions", label: "수정 이력" },
          { value: "records", label: "신고·조치 기록" },
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
        <div>글 ID: {id}</div>
        {post.user_id ? <div>작성자 ID: {post.user_id}</div> : null}
        {post.topic_id ? <div>카테고리 ID: {post.topic_id} ({slug})</div> : null}
        <div>작성 구분 값: {String(post.origin_kind ?? "")}</div>
        <div>버전(updated_at): {String(post.updated_at ?? "")}</div>
      </AdminTechDetails>

      {sheet === "hide" || sheet === "delete" ? (
        <CommunityActionSheet
          title={sheet === "hide" ? "게시글 숨기기" : "게시글 삭제"}
          rows={sheetRows}
          notice={
            sheet === "hide"
              ? "숨긴 글은 작성자에게만 보이고 안내 문구가 표시됩니다. 작성자에게 알림이 갑니다. 고정·공지는 함께 해제됩니다."
              : "삭제한 글은 아무도 볼 수 없습니다(복구 가능). 작성자에게 알림이 갑니다. 고정·공지는 함께 해제됩니다."
          }
          reason={{ minLength: 2, placeholder: "예: 광고성 게시글, 욕설 포함" }}
          ready={!showFault || fault !== ""}
          destructive={sheet === "delete"}
          confirmLabel={sheet === "hide" ? "숨기기" : "삭제"}
          onSubmit={(reason) =>
            patchPost({
              status: sheet === "hide" ? "hidden" : "deleted",
              reason,
              ...(fault ? { promotionFault: fault } : {}),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, sheet === "hide" ? "게시글을 숨겼습니다." : "게시글을 삭제했습니다.", { moderated: true, keepDraft: true })}
        >
          {faultPicker}
        </CommunityActionSheet>
      ) : null}
      {sheet === "restore" ? (
        <CommunityActionSheet
          title={status === "deleted" ? "게시글 복구" : "게시글 다시 공개"}
          rows={sheetRows}
          notice="이 글을 다시 모두에게 보이게 합니다."
          reason={null}
          confirmLabel={status === "deleted" ? "복구" : "다시 공개"}
          onSubmit={() => patchPost({ status: "active" })}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "게시글을 다시 공개했습니다.", { keepDraft: true })}
        />
      ) : null}
      {sheet === "save" ? (
        <CommunityActionSheet
          title="관리자 수정 저장"
          rows={[
            ...sheetRows.slice(0, 1),
            {
              label: "바뀌는 항목",
              value: [titleChanged ? "제목" : "", contentChanged || blocksChanged ? "본문" : "", topicChanged ? "카테고리" : ""]
                .filter(Boolean)
                .join(", "),
            },
          ]}
          notice="수정 전 내용은 수정 이력에 남습니다. 작성자에게 관리자 수정 알림이 갑니다."
          reason={{ minLength: 2, placeholder: "예: 개인정보 노출 부분 삭제" }}
          confirmLabel="수정 저장"
          onSubmit={(reason) => patchPost({ ...saveBody(), reason })}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "수정 내용을 저장했습니다.", { keepDraft: true })}
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
            return toCommunitySheetResult(r);
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
          title="상단 고정"
          rows={sheetRows.slice(0, 2)}
          notice="고정 한도: 피드 전체 3개 · 카테고리별 2개. 작성자에게 고정 알림이 갑니다."
          reason={{ minLength: 2, placeholder: "예: 유용한 정보 글" }}
          ready={pinScope === "feed" || Boolean(slug)}
          confirmLabel="상단 고정"
          onSubmit={async (reason) => {
            const until = pinUntil ? manilaLocalInputToUtcIso(pinUntil) : null;
            const r = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}/pin`, {
              method: "POST",
              body: { scope: pinScope, until, reason },
            });
            return toCommunitySheetResult(r);
          }}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "상단에 고정했습니다.", { keepDraft: true })}
        >
          <fieldset className="space-y-1 text-[13px]">
            <legend className="font-semibold text-sam-fg">고정 범위</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="pin-scope" checked={pinScope === "feed"} onChange={() => setPinScope("feed")} />
              피드 전체
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pin-scope"
                checked={pinScope === "topic"}
                disabled={!slug}
                onChange={() => setPinScope("topic")}
              />
              이 카테고리만 ({topicNameOf(slug)})
            </label>
          </fieldset>
          <label className="block space-y-1 text-[13px]">
            <span className="font-semibold text-sam-fg">고정 종료 (필리핀 시간, 비우면 기한 없음)</span>
            <input type="datetime-local" className={FIELD} value={pinUntil} onChange={(e) => setPinUntil(e.target.value)} />
          </label>
        </CommunityActionSheet>
      ) : null}
      {sheet === "unpin" ? (
        <CommunityActionSheet
          title="고정 해제"
          rows={sheetRows.slice(0, 1)}
          notice="이 글을 상단 고정에서 내립니다. 글은 그대로 남습니다."
          reason={null}
          confirmLabel="고정 해제"
          onSubmit={async () => {
            const r = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}/pin`, {
              method: "DELETE",
              body: {},
            });
            return toCommunitySheetResult(r);
          }}
          onClose={() => setSheet(null)}
          onSettled={(k) => settle(k, "고정을 해제했습니다.", { keepDraft: true })}
        />
      ) : null}
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-block text-[13px] font-medium text-sam-muted hover:text-sam-fg hover:underline">
      ← 목록으로
    </Link>
  );
}
