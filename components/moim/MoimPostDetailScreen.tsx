"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet, dibayConfirm, type DibayActionSheetItem } from "@/components/ui/dibay-overlay";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, SAM_TIER1_HEADER_ICON_GLYPH_CLASS, samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import { formatAppDateTime } from "@/lib/i18n/locale-for-app-language";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimAuthorDto, MoimCommentDto, MoimPostDto } from "@/lib/moim/moim-api-types";
import { useMoimNotificationRead } from "@/lib/moim/use-moim-notification-read";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { MoimReportSheet, type MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { MoimAvatar, MoimErrorState, MoimListSkeleton, MoimRoleBadge, moimCls, useMoimBoardLabel, useMoimToast } from "@/components/moim/moim-ui";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";
import { MoimNoticeBadge } from "@/components/moim/MoimPostRow";
import { DibaySpinner } from "@/components/ui/DibaySpinner";
import { useDibayImageViewer } from "@/components/common/media/DibayImageViewer";
import { moimPostGate, moimReadOnlyReason } from "@/lib/moim/moim-state-gate";

/**
 * 댓글 칸 머리·안내 (R3 U-05 · D-35): 비회원은 댓글 내용·작성자를 받지 않는다 → 수는 목록과 같은 `post.commentCount`,
 * 빈 목록 안내 대신 「댓글은 멤버만 볼 수 있어요」. 멤버는 받은 댓글 수와 「첫 댓글」 안내.
 */
export function moimCommentSection(
  viewerIsMember: boolean,
  post: Pick<MoimPostDto, "commentCount">,
  commentsLength: number,
  /** R4 #4·5: 앞 댓글이 더 있으면(받은 쪽이 일부) 수는 글의 `commentCount` 와 받은 수 중 큰 값 */
  hasOlder = false
): { count: number; note: "members_only" | "empty" | null } {
  if (!viewerIsMember) return { count: post.commentCount, note: "members_only" };
  if (hasOlder) return { count: Math.max(post.commentCount, commentsLength), note: null };
  return { count: commentsLength, note: commentsLength === 0 ? "empty" : null };
}

/** R4 #4·5: 앞(오래된) 댓글 쪽을 위에 붙인다 — 이미 있는 댓글은 다시 붙이지 않는다 */
export function prependMoimComments(older: MoimCommentDto[], current: MoimCommentDto[]): MoimCommentDto[] {
  const seen = new Set(current.map((c) => c.id));
  return [...older.filter((c) => !seen.has(c.id)), ...current];
}

function AuthorLine({ author, at }: { author: MoimAuthorDto; at: string }) {
  const { t, language } = useI18n();
  const name = author.isActiveMember ? author.nickname : t("moim_screen_left_member");
  return (
    <div className="flex min-w-0 items-center gap-2">
      <MoimAvatar url={author.isActiveMember ? author.avatarUrl : null} name={name} size={32} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="break-words text-[13.5px] text-sam-fg">{name}</b>
          {author.isActiveMember ? <MoimRoleBadge role={author.role} /> : null}
        </div>
        <p className="text-[11.5px] text-sam-muted" title={formatAppDateTime(at, language)}>
          {formatRelativeTimeAgo(at, language)}
        </p>
      </div>
    </div>
  );
}

/** 글 상세 /moim/[id]/posts/[postId] — 본문 · 사진 · 댓글 · ⋮ (수정·삭제·숨김·고정·신고) */
export function MoimPostDetailScreen({ moimId, postId }: { moimId: string; postId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useMoimToast();
  const boardLabel = useMoimBoardLabel();
  const { moim } = useMoimDetail(moimId);
  const [post, setPost] = useState<MoimPostDto | null>(null);
  /** R2 N-06: 이 화면으로 가는 모임 알림 읽음 (정책 §2) */
  useMoimNotificationRead(`/moim/${moimId}/posts/${postId}`, !!post);
  const [comments, setComments] = useState<MoimCommentDto[]>([]);
  /** R4 #4·5: 앞 댓글 커서(null = 처음 댓글까지 다 받음) */
  const [commentsBefore, setCommentsBefore] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [viewerIsMember, setViewerIsMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentMenu, setCommentMenu] = useState<MoimCommentDto | null>(null);
  const [report, setReport] = useState<MoimReportTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { openAt: openImage, viewer: imageViewer } = useDibayImageViewer();

  useEffect(() => {
    let alive = true;
    setError(null);
    void moimApi.post(postId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPost(r.post);
      setComments(r.comments);
      setCommentsBefore(r.commentsBefore ?? null);
      setViewerIsMember(r.viewerIsMember);
    });
    return () => {
      alive = false;
    };
  }, [postId, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  const loadOlderComments = async () => {
    if (!commentsBefore || loadingOlder) return;
    setLoadingOlder(true);
    const r = await moimApi.comments(postId, commentsBefore);
    setLoadingOlder(false);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    setComments((cur) => prependMoimComments(r.items, cur));
    setCommentsBefore(r.nextBefore);
  };

  /** R5 B19: 게시판 목록을 받지 못한 비멤버도 사용자 게시판 이름을 보인다 */
  const board = post ? moim?.boards.find((b) => b.id === post.boardId) ?? { kind: post.boardKind, name: post.boardName } : null;

  const rightSlot = useMemo(
    () =>
      post ? (
        <div className={samTier1HeaderIconCluster}>
          <button type="button" className={SAM_TIER1_HEADER_ACTION_BTN_CLASS} aria-label={t("moim_menu_aria")} onClick={() => setMenuOpen(true)}>
            <MoreVertical className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null,
    [post, t]
  );
  const boardTitle = board ? boardLabel(board) : "";
  const header = useMemo(
    () => ({ titleText: boardTitle || moim?.name || t("moim_tab"), subtitle: boardTitle ? moim?.name : undefined, backHref: moimRoutes.home(moimId), rightSlot }),
    [boardTitle, moim?.name, moimId, rightSlot, t]
  );
  useRegisterMainTier1Header(header);

  const removePost = async () => {
    if (!post) return;
    const ok = await dibayConfirm({ title: t("moim_post_delete_confirm_title"), confirmLabel: t("common_delete"), cancelLabel: t("common_cancel"), confirmTone: "destructive" });
    if (!ok) return;
    const r = await moimApi.removePost(post.id);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    router.replace(moimRoutes.home(moimId) + "?tab=board");
  };
  const hidePost = async () => {
    if (!post) return;
    const ok = await dibayConfirm({ title: t("moim_post_hide_confirm_title"), confirmLabel: t("moim_post_hide_btn"), cancelLabel: t("common_cancel"), confirmTone: "destructive" });
    if (!ok) return;
    const r = await moimApi.removePost(post.id, null);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    router.replace(moimRoutes.home(moimId) + "?tab=board");
  };
  const togglePin = async () => {
    if (!post) return;
    const r = await moimApi.pinPost(post.id, !post.isPinned);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    toast.show(post.isPinned ? t("moim_post_unpinned_toast") : t("moim_post_pinned_toast"));
    reload();
  };

  const sendComment = async () => {
    const body = draft.trim();
    if (!post || !body || sending) return;
    setSending(true);
    const r = await moimApi.addComment(post.id, body);
    setSending(false);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    setDraft("");
    reload();
  };
  const removeComment = async (c: MoimCommentDto) => {
    /** R5 B3: 남의 댓글은 지우는 것이 아니라 숨기는 것 — 확인창도 「숨길까요?」 */
    const ok = await dibayConfirm(
      c.viewerIsAuthor
        ? { title: t("moim_comment_delete_confirm_title"), confirmLabel: t("common_delete"), cancelLabel: t("common_cancel"), confirmTone: "destructive" }
        : { title: t("moim_comment_hide_confirm_title"), confirmLabel: t("moim_post_hide_btn"), cancelLabel: t("common_cancel"), confirmTone: "destructive" }
    );
    if (!ok) return;
    const r = await moimApi.removeComment(c.id);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    reload();
  };

  if (error) {
    return (
      <div className={moimCls.page}>
        <MoimErrorState messageKey={moimErrorKey(error)} onRetry={error === "moim_post_not_found" ? undefined : reload} />
      </div>
    );
  }
  if (!post) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={2} />
      </div>
    );
  }

  /**
   * R5 R-A (B2·B17): 모임 상태 → 할 수 있는 동작 한 곳. 모임 상세가 아직 없으면 작성자의 수정·삭제만(글 응답으로 앎),
   * 하단 줄은 그리지 않는다(깜빡임 방지).
   */
  const gate = moim ? moimPostGate(moim, post, viewerIsMember) : null;
  /** ⋮ 순서 (R3 1-1): 일반(수정·고정) → 신고 → 위험(삭제·숨김) */
  const items: DibayActionSheetItem[] = [];
  if (gate ? gate.canEdit : post.viewerIsAuthor) {
    items.push({ key: "edit", label: t("common_edit"), onClick: () => router.push(`${moimRoutes.write(moimId)}?edit=${post.id}`) });
  }
  if (gate?.canPin) {
    items.push({ key: "pin", label: post.isPinned ? t("moim_post_unpin_btn") : t("moim_post_pin_btn"), onClick: () => void togglePin() });
  }
  if (gate?.canReport) {
    items.push({ key: "report", label: t("moim_menu_report"), onClick: () => setReport({ type: "post", id: post.id }) });
  }
  if (post.viewerIsAuthor) {
    items.push({ key: "delete", label: t("common_delete"), danger: true, onClick: () => void removePost() });
  } else if (gate?.canHide) {
    items.push({ key: "hide", label: t("moim_post_hide_btn"), danger: true, onClick: () => void hidePost() });
  }
  const commentSection = moimCommentSection(viewerIsMember, post, comments.length, !!commentsBefore);

  const commentItems: DibayActionSheetItem[] = commentMenu
    ? commentMenu.viewerIsAuthor || gate?.canHide
      ? [{ key: "delete", label: commentMenu.viewerIsAuthor ? t("common_delete") : t("moim_post_hide_btn"), danger: true, onClick: () => void removeComment(commentMenu) }]
      : [{ key: "report", label: t("moim_menu_report"), onClick: () => setReport({ type: "comment", id: commentMenu.id }) }]
    : [];

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <article className={`${moimCls.column} flex-1 pb-6`}>
        <div className="border-b border-sam-border bg-sam-surface px-4 py-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {post.isPinned ? <MoimNoticeBadge /> : null}
            {post.visibility === "public" ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_post_public_badge")}</span> : null}
          </div>
          {post.title ? <h1 className="mb-3 break-words text-[18px] font-bold text-sam-fg">{post.title}</h1> : null}
          <AuthorLine author={post.author} at={post.createdAt} />
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-sam-fg">{post.body}</p>
          {post.images.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {/* R5 B8: 누르면 공용 사진 뷰어 */}
              {post.images.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  className="block w-full rounded-ui-rect"
                  aria-label={t("moim_post_image_aria", { n: i + 1 })}
                  onClick={() => openImage(post.images, i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full rounded-ui-rect bg-sam-surface-muted object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <section>
          <div className={moimCls.sectionHead}>
            <h2 className={moimCls.sectionTitle}>{t("moim_comments_title", { count: commentSection.count })}</h2>
          </div>
          {commentSection.note ? (
            <p className="px-4 text-[13px] text-sam-muted">
              {commentSection.note === "members_only" ? t("moim_comments_members_only") : t("moim_comments_empty")}
            </p>
          ) : null}
          {/* R4 #4·5: 최신 100개부터 — 앞 댓글은 「이전 댓글 더 보기」 */}
          {viewerIsMember && commentsBefore ? (
            <div className="px-4 pb-2">
              <button type="button" disabled={loadingOlder} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={() => void loadOlderComments()}>
                {loadingOlder ? <DibaySpinner size="sm" tone="current" label={t("common_loading")} /> : t("moim_comments_older_btn")}
              </button>
            </div>
          ) : null}
          <div>
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2 border-b border-sam-border bg-sam-surface px-4 py-3">
                <div className="min-w-0 flex-1">
                  <AuthorLine author={c.author} at={c.createdAt} />
                  <p className="mt-1.5 whitespace-pre-wrap break-words pl-10 text-[14px] text-sam-fg">{c.body}</p>
                </div>
                {viewerIsMember && moim?.viewer.loggedIn ? (
                  <button type="button" className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center text-sam-muted" aria-label={t("moim_comment_menu_aria")} onClick={() => setCommentMenu(c)}>
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </article>

      {gate ? (
        <MoimStickyFooter compact>
          <div className={moimCls.column}>
            {gate.footer === "composer" ? (
              <div className="flex items-end gap-2">
                <textarea
                  className={`${moimCls.textarea} flex-1 resize-none py-2`}
                  rows={1}
                  value={draft}
                  maxLength={2000}
                  placeholder={t("moim_comment_placeholder")}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="button" className={`${moimCls.btnPrimary} ${moimCls.btnSm}`} disabled={!draft.trim() || sending} onClick={sendComment}>
                  {t("moim_comment_send_btn")}
                </button>
              </div>
            ) : gate.footer === "readonly" ? (
              <p role="status" className="py-1 text-center text-[13px] text-sam-muted" data-testid="moim-post-footer-readonly">
                {t(moimReadOnlyReason(moim) === "blocked" ? "moim_err_moim_blocked" : "moim_screen_closed_notice")}
              </p>
            ) : gate.footer === "login" ? (
              <Link href={buildLoginPath(pathname ?? undefined)} className={`${moimCls.btnSecondary} w-full`}>
                {t("moim_comment_login_btn")}
              </Link>
            ) : gate.footer === "banned" ? (
              <p role="status" className="py-1 text-center text-[13px] text-sam-muted">
                {t("moim_err_moim_join_not_allowed")}
              </p>
            ) : gate.footer === "pending" ? (
              <p role="status" className="py-1 text-center text-[13px] text-sam-muted">
                {t("moim_comment_pending_note")}
              </p>
            ) : (
              <Link href={moimRoutes.home(moimId)} className={`${moimCls.btnSecondary} w-full`}>
                {t("moim_comment_join_btn")}
              </Link>
            )}
          </div>
        </MoimStickyFooter>
      ) : null}

      <DibayActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} cancelLabel={t("common_cancel")} items={items} notice={items.length === 0 ? t("moim_menu_empty") : undefined} />
      <DibayActionSheet open={commentMenu != null} onClose={() => setCommentMenu(null)} cancelLabel={t("common_cancel")} items={commentItems} />
      <MoimReportSheet moimId={moimId} reasons={moim?.reportReasons} target={report} onClose={() => setReport(null)} onDone={(m) => toast.show(m, "success")} />
      {imageViewer}
      {toast.node}
    </div>
  );
}
