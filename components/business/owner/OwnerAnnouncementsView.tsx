"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OWNER_ADMIN_OUTLINE_BTN_CLASS } from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  fetchOwnerAnnouncements,
  type OwnerAnnouncementListItemDto,
} from "@/lib/notices/owner-announcements-client";

/**
 * 사장님 「운영 공지」 목록 — `/stores/owner/announcements` (배달 오픈 4단계 · Owner 2026-11-10).
 * 어드민이 쓴 사장님 전용 공지(app_notices audience≠all). 고정 먼저 · 게시일 최신순 · 안 읽음 점.
 * 매장 공지(`/stores/owner/notices`, 사장님 → 고객)와 다른 화면이다.
 */
export function OwnerAnnouncementsView() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const shellStoreId = useBusinessAdminStore()?.storeRow?.id?.trim() ?? "";
  const storeId = searchParams.get("storeId")?.trim() || shellStoreId;
  const [items, setItems] = useState<OwnerAnnouncementListItemDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await fetchOwnerAnnouncements();
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setItems(res.announcements);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed && items == null) {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="sam-text-body text-sam-danger">{t("owner_announcements_load_failed")}</p>
        <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => void load()}>
          {t("owner_announcements_retry")}
        </button>
      </div>
    );
  }
  if (items == null) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 sam-text-body text-sam-muted">
        {t("owner_announcements_empty")}
      </div>
    );
  }

  return (
    <ul
      className="divide-y divide-sam-border overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
      data-owner-announcements-list
    >
      {items.map((n) => (
        <li key={n.id}>
          <Link
            href={OwnerRoutes.announcementDetail(n.id, storeId)}
            className="flex items-start gap-2 px-3 py-3 active:bg-sam-pressed-surface sm:px-4"
          >
            <span
              aria-hidden
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-sam-danger"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                {n.isPinned ? (
                  <span className="shrink-0 rounded-ui-rect bg-sam-primary-soft px-1.5 py-0.5 sam-text-helper font-semibold text-sam-primary">
                    {t("owner_announcements_pinned")}
                  </span>
                ) : null}
                <span
                  className={`min-w-0 break-words sam-text-body ${n.read ? "text-sam-fg" : "font-semibold text-sam-fg"}`}
                >
                  {n.title}
                </span>
              </span>
              <span className="mt-0.5 block sam-text-helper text-sam-meta">
                {formatMypageDate(n.createdAt, { lang: language })}
                {n.read ? "" : ` · ${t("owner_announcements_unread")}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
