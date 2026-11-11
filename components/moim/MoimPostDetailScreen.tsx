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
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { MoimReportSheet, type MoimReportTarget } from "@/components/moim/MoimReportSheet";
import { MoimAvatar, MoimErrorState, MoimListSkeleton, MoimRoleBadge, moimCls, useMoimBoardLabel, useMoimToast } from "@/components/moim/moim-ui";

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
  const [comments, setComments] = useState<MoimCommentDto[]>([]);
  const [viewerIsMember, setViewerIsMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentMenu, setCommentMenu] = useState<MoimCommentDto | null>(null);
  const [report, setReport] = useState<MoimReportTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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
      setViewerIsMember(r.viewerIsMember);
    });
    return () => {
      alive = false;
    };
  }, [postId, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);

  const board = post ? moim?.boards.find((b) => b.id === post.boardId) ?? { kind: post.boardKind, name: null } : null;

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
    const ok = await dibayConfirm({ title: t("moim_comment_delete_confirm_title"), confirmLabel: t("common_delete"), cancelLabel: t("common_cancel"), confirmTone: "destructive" });
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

  const can = moim?.can;
  const items: DibayActionSheetItem[] = [];
  if (post.viewerIsAuthor) {
    items.push({ key: "edit", label: t("common_edit"), onClick: () => router.push(`${moimRoutes.write(moimId)}?edit=${post.id}`) });
    items.push({ key: "delete", label: t("common_delete"), danger: true, onClick: () => void removePost() });
  } else if (can?.hide_post) {
    items.push({ key: "hide", label: t("moim_post_hide_btn"), danger: true, onClick: () => void hidePost() });
  }
  if (post.boardKind === "notice" && can?.pin_notice) {
    items.push({ key: "pin", label: post.isPinned ? t("moim_post_unpin_btn") : t("moim_post_pin_btn"), onClick: () => void togglePin() });
  }
  if (!post.viewerIsAuthor && moim?.viewer.loggedIn) {
    items.push({ key: "report", label: t("moim_menu_report"), onClick: () => setReport({ type: "post", id: post.id }) });
  }

  const commentItems: DibayActionSheetItem[] = commentMenu
    ? commentMenu.viewerIsAuthor || can?.hide_post
      ? [{ key: "delete", label: commentMenu.viewerIsAuthor ? t("common_delete") : t("moim_post_hide_btn"), danger: true, onClick: () => void removeComment(commentMenu) }]
      : [{ key: "report", label: t("moim_menu_report"), onClick: () => setReport({ type: "comment", id: commentMenu.id }) }]
    : [];

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <article className={`${moimCls.column} flex-1 pb-6`}>
        <div className="border-b border-sam-border bg-sam-surface px-4 py-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {post.isPinned ? <span className={`${moimCls.badge} ${moimCls.badgeGreen}`}>{t("moim_post_pinned_badge")}</span> : null}
            {post.visibility === "public" ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_post_public_badge")}</span> : null}
          </div>
          {post.title ? <h1 className="mb-3 break-words text-[18px] font-bold text-sam-fg">{post.title}</h1> : null}
          <AuthorLine author={post.author} at={post.createdAt} />
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-sam-fg">{post.body}</p>
          {post.images.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {post.images.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${u}-${i}`} src={u} alt="" className="w-full rounded-ui-rect bg-sam-surface-muted object-cover" />
              ))}
            </div>
          ) : null}
        </div>

        <section>
          <div className={moimCls.sectionHead}>
            <h2 className={moimCls.sectionTitle}>{t("moim_comments_title", { count: comments.length })}</h2>
          </div>
          {comments.length === 0 ? <p className="px-4 text-[13px] text-sam-muted">{t("moim_comments_empty")}</p> : null}
          <div>
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2 border-b border-sam-border bg-sam-surface px-4 py-3">
                <div className="min-w-0 flex-1">
                  <AuthorLine author={c.author} at={c.createdAt} />
                  <p className="mt-1.5 whitespace-pre-wrap break-words pl-10 text-[14px] text-sam-fg">{c.body}</p>
                </div>
                {moim?.viewer.loggedIn ? (
                  <button type="button" className="grid h-8 w-8 shrink-0 place-items-center text-sam-muted" aria-label={t("moim_comment_menu_aria")} onClick={() => setCommentMenu(c)}>
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </article>

      <div className="sticky bottom-0 border-t border-sam-border bg-sam-surface px-4 pb-[calc(10px+var(--safe-bottom,0px))] pt-2">
        <div className={moimCls.column}>
          {viewerIsMember ? (
            <div className="flex items-end gap-2">
              <textarea
                className={`${moimCls.textarea} min-h-[42px] flex-1 resize-none py-2`}
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
          ) : moim && !moim.viewer.loggedIn ? (
            <Link href={buildLoginPath(pathname ?? undefined)} className={`${moimCls.btnSecondary} w-full`}>
              {t("moim_comment_login_btn")}
            </Link>
          ) : (
            <Link href={moimRoutes.home(moimId)} className={`${moimCls.btnSecondary} w-full`}>
              {t("moim_comment_join_btn")}
            </Link>
          )}
        </div>
      </div>

      <DibayActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} cancelLabel={t("common_cancel")} items={items} notice={items.length === 0 ? t("moim_menu_empty") : undefined} />
      <DibayActionSheet open={commentMenu != null} onClose={() => setCommentMenu(null)} cancelLabel={t("common_cancel")} items={commentItems} />
      <MoimReportSheet moimId={moimId} target={report} onClose={() => setReport(null)} onDone={(m) => toast.show(m, "success")} />
      {toast.node}
    </div>
  );
}
