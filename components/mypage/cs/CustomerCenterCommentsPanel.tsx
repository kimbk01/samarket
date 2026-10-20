"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { useMyScreenBackGuard } from "@/components/mypage/ds/MyScreen";
import { MY_STICKY_CTA_BODY_CLEARANCE_CLASS, MYPAGE_TOAST_BOTTOM_VAR } from "@/components/mypage/ds/MyStickyCta";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { CC_COMMENTS_PAGE_DEFAULT } from "@/lib/mypage/customer-center-board-query";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import {
  fetchMypageListJson,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { MYPAGE_COLUMN_MAX_WIDTH_CLASS, MYPAGE_GUTTER_X_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

export type CustomerCenterCommentRow = {
  id: string;
  body: string;
  createdAt: string;
  mine?: boolean;
};

type CommentsJson = { ok?: boolean; comments?: CustomerCenterCommentRow[]; nextCursor?: string | null };

/** 댓글 글자 수 상한 — 서버 POST 와 같은 값 */
export const CC_COMMENT_MAX_LEN = 2000;

/** [등록] 활성 규칙 (S62) — 공백 제외 1자 이상 · 2000자 이하 · 진행 중 아님 */
export function canSubmitCustomerCenterComment(draft: string, pending: boolean): boolean {
  const len = draft.trim().length;
  return !pending && len >= 1 && len <= CC_COMMENT_MAX_LEN;
}

export function customerCenterCommentsCacheKey(contentId: string): string {
  return `me:cc:comments:${contentId}`;
}

export function customerCenterCommentsUrl(contentId: string, cursor: string | null): string {
  const sp = new URLSearchParams({ limit: String(CC_COMMENTS_PAGE_DEFAULT) });
  if (cursor) sp.set("cursor", cursor);
  return `/api/me/settings/notices/${encodeURIComponent(contentId)}/comments?${sp.toString()}`;
}

/** 입력 바 textarea 자동 높이 — 1~4줄 */
const INPUT_LINE_PX = 22;
const INPUT_MAX_LINES = 4;

/**
 * 고객센터 게시글 댓글 (최종 설계 S62) — 최신순 목록 + 이전 댓글 더 보기(커서) + **하단 고정 입력 바**.
 * 연속 [등록] → POST 1회(`useMypageSubmitGuard`) · 삭제 = 확인 시트 → 결과 토스트 · 오류 = 댓글 영역만 오류+재시도.
 * 입력 중 뒤로 → 미저장 확인 시트(내용 있을 때만, T3).
 */
export function CustomerCenterCommentsPanel({
  contentId,
  enabled,
  initialCount,
  backHref,
}: {
  contentId: string;
  enabled: boolean;
  /** 상세 응답의 댓글 수 — 제목 "댓글 n" */
  initialCount?: number;
  /** 미저장 확인 후 [버리기] 시 이동할 곳 */
  backHref: string;
}) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const id = contentId.trim();
  const [draft, setDraft] = useState("");
  const [countDelta, setCountDelta] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const post = useMypageSubmitGuard();
  const del = useMypageSubmitGuard();

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<CustomerCenterCommentRow>> => {
      const json = await fetchMypageListJson<CommentsJson>(customerCenterCommentsUrl(id, cursor));
      if (!json.ok) throw new Error("cc_comments_not_ok");
      return {
        items: Array.isArray(json.comments) ? json.comments : [],
        next_cursor: typeof json.nextCursor === "string" && json.nextCursor ? json.nextCursor : null,
      };
    },
    [id]
  );

  const list = useMypageCursorList<CustomerCenterCommentRow>({
    cacheKey: enabled && id ? customerCenterCommentsCacheKey(id) : null,
    fetchPage,
    getId: (c) => c.id,
  });

  const dirty = enabled && draft.trim().length > 0;
  useMyScreenBackGuard(
    dirty
      ? () => {
          setLeaveConfirmOpen(true);
          return true;
        }
      : null
  );
  useOverlayHardwareBack(dirty && !leaveConfirmOpen && deleteTarget == null, () => setLeaveConfirmOpen(true));

  if (!enabled || !id) return null;

  const submit = () =>
    void post.run(async () => {
      const text = draft.trim();
      if (!canSubmitCustomerCenterComment(text, false)) return;
      try {
        const res = await fetch(`/api/me/settings/notices/${encodeURIComponent(id)}/comments`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; comment?: CustomerCenterCommentRow };
        if (!res.ok || !json.ok || !json.comment) throw new Error("post_failed");
        const created = json.comment;
        list.setItems((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        setCountDelta((d) => d + 1);
        setDraft("");
      } catch {
        // 입력 내용은 유지
        showMypageToast(
          safeT("cc_comments_post_failed", {
            fallbackKo: "댓글 등록에 실패했습니다",
            fallbackEn: "Could not post comment",
          }),
          "error"
        );
      }
    });

  const confirmDelete = (commentId: string) =>
    void del.run(async () => {
      try {
        const res = await fetch(
          `/api/me/settings/notices/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
          { method: "DELETE", credentials: "include" }
        );
        if (!res.ok) throw new Error("delete_failed");
        list.setItems((prev) => prev.filter((c) => c.id !== commentId));
        setCountDelta((d) => d - 1);
        showMypageToast(t("mypage_s62_comment_deleted"), "success");
      } catch {
        showMypageToast(t("mypage_s62_comment_delete_failed"), "error");
      }
    });

  const baseCount = typeof initialCount === "number" ? initialCount : list.items.length;
  const count = Math.max(0, Math.max(baseCount + countDelta, list.status === "ready" ? list.items.length : 0));

  let content: ReactNode;
  if (list.status === "loading") {
    content = <MyStateView kind="loading" template="list" rows={3} />;
  } else if (list.status === "error") {
    content = (
      <MyStateView
        kind="error"
        template="list"
        error={{
          message: safeT("cc_comments_load_failed", {
            fallbackKo: "댓글을 불러오지 못했습니다",
            fallbackEn: "Could not load comments",
          }),
          onRetry: () => void list.reload(),
        }}
      />
    );
  } else if (list.items.length === 0) {
    content = (
      <p className="py-4 text-[13px] text-sam-muted" data-testid="cc-comments-empty">
        {safeT("cc_comments_empty", { fallbackKo: "아직 댓글이 없습니다", fallbackEn: "No comments yet" })}
      </p>
    );
  } else {
    content = (
      <>
        <ul className="divide-y divide-sam-border-soft">
          {list.items.map((c) => (
            <li key={c.id} className="py-3" data-testid="cc-comment-row">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{c.body}</p>
                {c.mine ? (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label={t("mypage_s62_comment_more")}
                      aria-expanded={menuFor === c.id}
                      data-testid="cc-comment-more"
                      onClick={() => setMenuFor((v) => (v === c.id ? null : c.id))}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sam-meta ${Sam.focusRing}`}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {menuFor === c.id ? (
                      <div className="absolute right-0 top-9 z-10 min-w-[96px] overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
                        <button
                          type="button"
                          data-testid="cc-comment-delete"
                          className="block w-full px-4 py-2.5 text-left text-[14px] font-medium text-sam-danger active:bg-sam-pressed-surface"
                          onClick={() => {
                            setMenuFor(null);
                            setDeleteTarget(c.id);
                          }}
                        >
                          {t("common_delete")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-[12px] text-sam-meta">{formatMypageDate(c.createdAt, { style: "datetime" })}</p>
            </li>
          ))}
        </ul>
        <MyListPager
          hasMore={list.nextCursor != null}
          loading={list.loadingMore}
          error={list.loadMoreError}
          onLoadMore={list.loadMore}
        />
      </>
    );
  }

  return (
    <section className={`border-t border-sam-border-soft pt-4 ${MY_STICKY_CTA_BODY_CLEARANCE_CLASS}`} data-testid="cc-comments">
      <h2 className="text-[14px] font-semibold text-sam-fg">
        {safeT("cc_comments_title", { fallbackKo: "댓글", fallbackEn: "Comments" })}
        {` ${count}`}
      </h2>
      {content}
      <CustomerCenterCommentInputBar
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        pending={post.pending}
        placeholder={safeT("cc_comments_placeholder", {
          fallbackKo: "의견을 남겨 주세요",
          fallbackEn: "Leave a comment",
        })}
        submitLabel={safeT("cc_comments_submit", { fallbackKo: "등록", fallbackEn: "Post" })}
      />
      <MobileConfirmBottomSheet
        open={deleteTarget != null}
        title={t("mypage_s62_comment_delete_title")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("common_delete")}
        confirmTone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) confirmDelete(target);
        }}
      />
      <MobileConfirmBottomSheet
        open={leaveConfirmOpen}
        title={t("mypage_s62_discard_title")}
        cancelLabel={t("mypage_s62_discard_keep")}
        confirmLabel={t("mypage_s01_discard_confirm")}
        confirmTone="danger"
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          setDraft("");
          router.push(backHref);
        }}
      />
    </section>
  );
}

/**
 * 하단 고정 댓글 입력 바 (S62 · `MyStickyCta` 변형) — textarea 1~4줄 자동 높이 + [등록],
 * 키보드가 열리면 키보드 위(`useFormKeyboardViewport`), 닫히면 safe-area 위.
 */
function CustomerCenterCommentInputBar({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder,
  submitLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
  submitLabel: string;
}) {
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();
  const barRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const canSubmit = canSubmitCustomerCenterComment(value, pending);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const max = INPUT_LINE_PX * INPUT_MAX_LINES + 20;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [value]);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty(MYPAGE_TOAST_BOTTOM_VAR, `${el.offsetHeight + 8}px`);
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(MYPAGE_TOAST_BOTTOM_VAR);
    };
  }, []);

  return (
    <div
      ref={barRef}
      data-testid="cc-comment-input-bar"
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-sam-border-soft bg-sam-app/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-app/88"
      style={{ paddingBottom: `${effectiveBottomInset}px` }}
    >
      <div className={`pointer-events-auto mx-auto flex w-full ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} items-end gap-2 ${MYPAGE_GUTTER_X_CLASS} py-2.5`}>
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          maxLength={CC_COMMENT_MAX_LEN}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid="cc-comment-input"
          className={`${Sam.input.base} min-h-[44px] flex-1 resize-none py-2.5 text-[16px] leading-[22px]`}
        />
        <button
          type="button"
          disabled={!canSubmit}
          aria-busy={pending}
          onClick={canSubmit ? onSubmit : undefined}
          data-testid="cc-comment-submit"
          className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} ${Sam.focusRing} min-h-[44px] shrink-0 disabled:opacity-45`}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
