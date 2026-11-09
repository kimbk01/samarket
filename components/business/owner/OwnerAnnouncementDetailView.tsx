"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OWNER_ADMIN_OUTLINE_BTN_CLASS } from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  fetchOwnerAnnouncementDetail,
  recordOwnerAnnouncementView,
  type OwnerAnnouncementDetailResult,
} from "@/lib/notices/owner-announcements-client";

/**
 * 사장님 「운영 공지」 상세 — `/stores/owner/announcements/[id]` (배달 오픈 4단계 · Owner 2026-11-10).
 * 열면 열람 1회 기록 + 이 공지를 가리키는 내 운영 알림 읽음(서버). 본문 = 고객센터와 같은 안전 마크다운.
 */
export function OwnerAnnouncementDetailView({ noticeId }: { noticeId: string }) {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const shellStoreId = useBusinessAdminStore()?.storeRow?.id?.trim() ?? "";
  const storeId = searchParams.get("storeId")?.trim() || shellStoreId;
  const [state, setState] = useState<OwnerAnnouncementDetailResult | null>(null);

  const load = useCallback(async () => {
    setState(null);
    if (!noticeId.trim()) {
      setState({ ok: false, error: "invalid_id", status: 404 });
      return;
    }
    const res = await fetchOwnerAnnouncementDetail(noticeId);
    setState(res);
    if (res.ok && !res.unavailable) void recordOwnerAnnouncementView(noticeId);
  }, [noticeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <Link href={OwnerRoutes.announcements(storeId)} className={`inline-block ${OWNER_ADMIN_OUTLINE_BTN_CLASS}`}>
      {t("owner_announcements_back_to_list")}
    </Link>
  );

  if (state == null) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (!state.ok) {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="sam-text-body text-sam-muted">
          {state.status === 404 ? t("owner_announcements_not_found") : t("owner_announcements_load_failed")}
        </p>
        <div className="flex flex-wrap gap-2">
          {state.status === 404 ? null : (
            <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => void load()}>
              {t("owner_announcements_retry")}
            </button>
          )}
          {backLink}
        </div>
      </div>
    );
  }
  if (state.unavailable) {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <article className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h1 className="break-words sam-text-body-lg font-semibold text-sam-fg">{state.title}</h1>
          <p className="sam-text-body text-sam-muted">{language === "en" ? state.messageEn : state.message}</p>
        </article>
        {backLink}
      </div>
    );
  }

  const n = state.notice;
  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <article className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-owner-announcement-detail>
        <header className="space-y-1">
          {n.isPinned ? (
            <span className="inline-block rounded-ui-rect bg-sam-primary-soft px-1.5 py-0.5 sam-text-helper font-semibold text-sam-primary">
              {t("owner_announcements_pinned")}
            </span>
          ) : null}
          <h1 className="break-words sam-text-body-lg font-semibold text-sam-fg">{n.title}</h1>
          <p className="sam-text-helper text-sam-meta">
            {[n.authorLabel, formatMypageDate(n.createdAt, { lang: language })].filter(Boolean).join(" · ")}
          </p>
        </header>
        {n.heroImageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
            <SamarketThumbnail
              src={n.heroImageUrl}
              alt=""
              fill
              fetchDisplayPx={640}
              className="h-full w-full"
              imageClassName="object-cover"
              roundedClassName="rounded-ui-rect"
            />
          </div>
        ) : null}
        <CustomerCenterSafeMarkdownBody body={n.body} />
      </article>
      {/* 설계 v3.2 §3-4-2 — 아래쪽 「이전 공지 · 목록 · 다음 공지」 (목록 순서 = 고정 먼저 · 최신순) */}
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" data-owner-announcement-nav>
        <div className="min-w-0">
          {n.prev ? (
            <Link
              href={OwnerRoutes.announcementDetail(n.prev.id, storeId)}
              className="block min-w-0 sam-text-helper text-sam-muted"
              data-owner-announcement-prev
            >
              <span className="block">‹ {t("owner_announcements_prev")}</span>
              <span className="block truncate text-sam-fg">{n.prev.title}</span>
            </Link>
          ) : null}
        </div>
        {backLink}
        <div className="min-w-0 text-right">
          {n.next ? (
            <Link
              href={OwnerRoutes.announcementDetail(n.next.id, storeId)}
              className="block min-w-0 sam-text-helper text-sam-muted"
              data-owner-announcement-next
            >
              <span className="block">{t("owner_announcements_next")} ›</span>
              <span className="block truncate text-sam-fg">{n.next.title}</span>
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
