"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { DIBAY_SECONDARY_TAB_LABEL_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimMyContentItemDto, MoimMyContentType } from "@/lib/moim/moim-api-types";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";
import { DibaySpinner } from "@/components/ui/DibaySpinner";

const TABS: { type: MoimMyContentType; label: MessageKey; empty: MessageKey; confirm: MessageKey }[] = [
  { type: "post", label: "moim_my_content_tab_posts", empty: "moim_my_content_empty_posts", confirm: "moim_post_delete_confirm_title" },
  { type: "comment", label: "moim_my_content_tab_comments", empty: "moim_my_content_empty_comments", confirm: "moim_comment_delete_confirm_title" },
  { type: "album", label: "moim_my_content_tab_photos", empty: "moim_my_content_empty_photos", confirm: "moim_album_delete_confirm_title" },
];

/** 줄을 누르면 갈 곳 — 내가 활동 멤버이고 보이는 글일 때만 글 상세 (나간 모임·숨긴 글은 열 수 없어 이동 없음) */
export function moimMyContentHref(item: MoimMyContentItemDto): string | null {
  if (!item.viewerIsActiveMember || item.status !== "active") return null;
  if (item.type === "post") return moimRoutes.post(item.moimId, item.id);
  if (item.type === "comment" && item.postId) return moimRoutes.post(item.moimId, item.postId);
  return null;
}

/** 줄 배지 — 숨겨짐 · 나간 모임 · 종료 */
export function moimMyContentBadges(item: MoimMyContentItemDto): MessageKey[] {
  const out: MessageKey[] = [];
  if (item.status === "hidden") out.push("moim_my_content_hidden_badge");
  if (item.moimStatus === "closed") out.push("moim_card_closed_badge");
  else if (!item.viewerIsActiveMember) out.push("moim_my_content_left_badge");
  return out;
}

/** 기존 삭제 라우트 하나씩 (작성자 삭제 — 숨김 포함, 서버 S-2) */
function removeMyContent(item: MoimMyContentItemDto) {
  if (item.type === "post") return moimApi.removePost(item.id);
  if (item.type === "comment") return moimApi.removeComment(item.id);
  return moimApi.removeAlbum(item.id);
}

/**
 * 내가 쓴 글·댓글·사진 /moim/my-content (R5 B1 · E8 · D-36) — 나간 뒤·숨겨진 뒤에도 작성자가 지울 수 있는 길.
 * 한 탭 = 한 요청(20개 쪽). 삭제된 모임은 서버가 뺀다.
 */
export function MoimMyContentScreen({ moimId }: { moimId: string | null }) {
  const { t, language } = useI18n();
  const toast = useMoimToast();
  const [tab, setTab] = useState<MoimMyContentType>("post");
  const [items, setItems] = useState<MoimMyContentItemDto[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const header = useMemo(
    () => ({ titleText: t("moim_my_content_title"), backHref: moimId ? moimRoutes.home(moimId) : moimRoutes.tab }),
    [moimId, t]
  );
  useRegisterMainTier1Header(header);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setFailedCode(null);
    setNextBefore(null);
    void moimApi.myContent({ type: tab, moimId }).then((r) => {
      if (!alive) return;
      if (!r.ok) return setFailedCode(r.error);
      setItems(r.items);
      setNextBefore(r.nextBefore);
    });
    return () => {
      alive = false;
    };
  }, [tab, moimId, key]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    const r = await moimApi.myContent({ type: tab, moimId, before: nextBefore });
    setLoadingMore(false);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    setItems((cur) => [...(cur ?? []), ...r.items.filter((x) => !(cur ?? []).some((c) => c.id === x.id))]);
    setNextBefore(r.nextBefore);
  }, [loadingMore, moimId, nextBefore, t, tab, toast]);

  const tabDef = TABS.find((x) => x.type === tab) ?? TABS[0];

  const remove = async (item: MoimMyContentItemDto) => {
    if (busyId) return;
    const ok = await dibayConfirm({ title: t(tabDef.confirm), confirmLabel: t("common_delete"), cancelLabel: t("common_cancel"), confirmTone: "destructive" });
    if (!ok) return;
    setBusyId(item.id);
    const r = await removeMyContent(item);
    setBusyId(null);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    setItems((cur) => (cur ?? []).filter((x) => x.id !== item.id));
    toast.show(t("moim_my_content_deleted_toast"), "success");
  };

  const deleteBtn = (item: MoimMyContentItemDto) => (
    <button
      type="button"
      disabled={busyId !== null}
      className={`${moimCls.btnDanger} ${moimCls.btnSm} shrink-0`}
      onClick={() => void remove(item)}
      data-testid="moim-my-content-delete"
    >
      {busyId === item.id ? <DibaySpinner size="sm" tone="current" label={t("common_loading")} /> : t("common_delete")}
    </button>
  );

  const meta = (item: MoimMyContentItemDto) => (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-sam-muted">
      {!moimId ? <span className="break-words">{item.moimName}</span> : null}
      <span>{formatPhtDisplayDateTime(item.createdAt, language)}</span>
      {moimMyContentBadges(item).map((k) => (
        <span key={k} className={`${moimCls.badge} ${moimCls.badgeGray}`}>
          {t(k)}
        </span>
      ))}
    </span>
  );

  const textRow = (item: MoimMyContentItemDto) => {
    const href = moimMyContentHref(item);
    const open = expanded === item.id;
    const main =
      item.type === "post" ? (
        <>
          {item.title ? <b className="block break-words text-[14px] text-sam-fg">{item.title}</b> : null}
          {item.excerpt ? (
            <span className={`block whitespace-pre-wrap break-words text-[13px] text-sam-fg ${open ? "line-clamp-[10]" : "line-clamp-1"}`}>{item.excerpt}</span>
          ) : null}
        </>
      ) : (
        <>
          <span className="line-clamp-2 block whitespace-pre-wrap break-words text-[14px] text-sam-fg">{item.excerpt}</span>
          {item.postTitle ? <span className="mt-0.5 block break-words text-[12px] text-sam-muted">{t("moim_my_content_comment_on", { title: item.postTitle })}</span> : null}
        </>
      );
    const body = (
      <span className="min-w-0 flex-1">
        {main}
        {meta(item)}
      </span>
    );
    return (
      <li key={item.id} className="flex items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-3">
        {href ? (
          <Link href={href} className="flex min-w-0 flex-1">
            {body}
          </Link>
        ) : item.type === "post" ? (
          <button type="button" className="flex min-w-0 flex-1 text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : item.id)}>
            {body}
          </button>
        ) : (
          body
        )}
        {deleteBtn(item)}
      </li>
    );
  };

  return (
    <div className={`${moimCls.page} pb-10`}>
      <DibaySecondaryTabRow navRole="secondary" tier="section" bordered trackAriaLabel={t("moim_my_content_title")}>
        {TABS.map((x) => (
          <button key={x.type} type="button" role="tab" aria-selected={tab === x.type} className={dibaySecondaryTabClass(tab === x.type)} onClick={() => setTab(x.type)}>
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t(x.label)}</span>
          </button>
        ))}
      </DibaySecondaryTabRow>
      <div className={moimCls.column}>
        {failedCode ? (
          <MoimErrorState messageKey={moimErrorKey(failedCode)} onRetry={() => setKey((k) => k + 1)} />
        ) : items === null ? (
          <div className="pt-3">
            <MoimListSkeleton rows={3} />
          </div>
        ) : items.length === 0 ? (
          <MoimEmptyState>{t(tabDef.empty)}</MoimEmptyState>
        ) : tab === "album" ? (
          <ul className="grid grid-cols-3 gap-2 p-4">
            {items.map((item) => (
              <li key={item.id} className="grid gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl ?? ""} alt="" className="aspect-square w-full rounded-ui-rect bg-sam-surface-muted object-cover" />
                {meta(item)}
                {deleteBtn(item)}
              </li>
            ))}
          </ul>
        ) : (
          <ul>{items.map((item) => textRow(item))}</ul>
        )}
        {items && nextBefore ? (
          <div className="px-4 pt-3">
            <button type="button" disabled={loadingMore} className={`${moimCls.btnSecondary} ${moimCls.btnSm} w-full`} onClick={() => void loadMore()}>
              {loadingMore ? <DibaySpinner size="sm" tone="current" label={t("common_loading")} /> : t("moim_home_more_btn")}
            </button>
          </div>
        ) : null}
      </div>
      {toast.node}
    </div>
  );
}
