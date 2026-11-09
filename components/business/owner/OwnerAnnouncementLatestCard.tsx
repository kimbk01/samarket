"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  OWNER_HUB_SECONDARY_AFTER_MS,
  runNowOrScheduleOnStoreOwnerAdmin,
} from "@/lib/business/owner-hub-secondary-fetch-queue";
import {
  fetchOwnerAnnouncements,
  type OwnerAnnouncementListItemDto,
} from "@/lib/notices/owner-announcements-client";

/**
 * 사장님 허브 상단 「운영 공지」 최신 1건 카드 (배달 오픈 4단계 · Owner 2026-11-10).
 * 게시 중인 사장님 공지가 없거나 불러오기 실패면 아무것도 그리지 않는다.
 * 허브 2차 조회 직렬 큐로 불러 첫 화면 조회를 막지 않는다.
 */
export function OwnerAnnouncementLatestCard({
  storeId,
  className = "",
}: {
  storeId: string;
  /** 바깥 간격 — 부모가 space-y 면 비운다 */
  className?: string;
}) {
  const { t, language } = useI18n();
  const [item, setItem] = useState<OwnerAnnouncementListItemDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    runNowOrScheduleOnStoreOwnerAdmin(
      async () => {
        const res = await fetchOwnerAnnouncements({ limit: 1, latest: true });
        if (cancelled) return;
        setItem(res.ok ? (res.announcements[0] ?? null) : null);
      },
      // 키 없이 — 다시 그려질 때(Strict·재방문)도 매번 새로 불러 카드가 사라지지 않게
      OWNER_HUB_SECONDARY_AFTER_MS.inquiries
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!item) return null;

  return (
    <Link
      href={OwnerRoutes.announcementDetail(item.id, storeId)}
      className={`flex shrink-0 items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 active:bg-sam-pressed-surface ${className}`.trim()}
      data-owner-announcement-latest
    >
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-sam-danger"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block sam-text-helper font-semibold text-sam-primary">{t("owner_announcements_title")}</span>
        <span className={`mt-0.5 block break-words sam-text-body text-sam-fg ${item.read ? "" : "font-semibold"}`}>
          {item.title}
        </span>
        <span className="mt-0.5 block sam-text-helper text-sam-meta">
          {formatMypageDate(item.createdAt, { lang: language })}
        </span>
      </span>
      <span className="shrink-0 self-center sam-text-helper text-sam-muted">{t("owner_announcements_view_all")}</span>
    </Link>
  );
}
