"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { AdminBanner } from "@/lib/types/admin-banner";
import {
  getBannerForAdminById,
  setBannerStatus,
} from "@/lib/admin-banners/mock-admin-banners";
import { getBannerChangeLogs } from "@/lib/admin-banners/mock-banner-change-logs";
import { getBannerPlacementByKey } from "@/lib/admin-banners/mock-banner-placements";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerStatusBadge } from "./AdminBannerStatusBadge";
import { AdminBannerPreview } from "./AdminBannerPreview";
import { AdminBannerChangeLogList } from "./AdminBannerChangeLogList";

interface AdminBannerDetailPageProps {
  bannerId: string;
}

export function AdminBannerDetailPage({ bannerId }: AdminBannerDetailPageProps) {
  const [refresh, setRefresh] = useState(0);
  const banner = getBannerForAdminById(bannerId);
  const logs = getBannerChangeLogs(bannerId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!banner) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        배너를 찾을 수 없습니다.
      </div>
    );
  }

  const placementDef = getBannerPlacementByKey(banner.placement);

  const handleStatus = (status: AdminBanner["status"]) => {
    setBannerStatus(bannerId, status);
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="배너 상세" backHref="/admin/banners" />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/banners/${bannerId}/edit`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          수정
        </Link>
        <span className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-meta">
          순서 조정 (예정)
        </span>
        {(banner.status === "draft" || banner.status === "paused" || banner.status === "hidden") && (
          <button
            type="button"
            onClick={() => handleStatus("active")}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
          >
            활성
          </button>
        )}
        {banner.status === "active" && (
          <button
            type="button"
            onClick={() => handleStatus("paused")}
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body text-amber-800 hover:bg-amber-100"
          >
            일시중지
          </button>
        )}
        {(banner.status === "active" || banner.status === "paused") && (
          <button
            type="button"
            onClick={() => handleStatus("hidden")}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100"
          >
            숨김
          </button>
        )}
      </div>

      <AdminCard title="배너 정보">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">제목</dt>
            <dd className="font-medium text-sam-fg">{banner.title || "(제목 없음)"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">설명</dt>
            <dd className="text-sam-fg">{banner.description || "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">위치</dt>
            <dd>{placementDef?.label ?? banner.placement}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">상태</dt>
            <dd>
              <AdminBannerStatusBadge status={banner.status} />
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">우선순위</dt>
            <dd>{banner.priority}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">노출 기간</dt>
            <dd>
              {banner.startAt && banner.endAt
                ? `${new Date(banner.startAt).toLocaleString("ko-KR")} ~ ${new Date(banner.endAt).toLocaleString("ko-KR")}`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">클릭 URL</dt>
            <dd className="truncate text-sam-fg">
              {banner.targetUrl ? (
                <a
                  href={banner.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-signature hover:underline"
                >
                  {banner.targetUrl}
                </a>
              ) : (
                "-"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">클릭 / 노출</dt>
            <dd>{banner.clickCount} / {banner.impressionCount}</dd>
          </div>
          {banner.adminMemo && (
            <div>
              <dt className="text-sam-muted">관리자 메모</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">{banner.adminMemo}</dd>
            </div>
          )}
          <div>
            <dt className="text-sam-muted">등록일 / 수정일</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(banner.createdAt).toLocaleString("ko-KR")} /{" "}
              {new Date(banner.updatedAt).toLocaleString("ko-KR")}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="미리보기">
        <AdminBannerPreview banner={banner} />
      </AdminCard>

      <AdminCard title="변경 이력">
        <AdminBannerChangeLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
