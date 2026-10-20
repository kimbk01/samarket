"use client";

/**
 * 긴급 조치 로그 — 서버 페이지 (`GET /api/admin/feed-emergency?part=logs`, R7).
 * surface 필터·쪽·크기는 주소에 보존 (`useAdminListQuery`). 화면 고정 상한(80건) 없음 — 저장 보존 범위 전체를 쪽으로 넘긴다.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { FeedEmergencyLog } from "@/lib/types/feed-emergency";
import {
  getFeedEmergencyActionLabel,
  SECTION_OVERRIDE_LABELS,
} from "@/lib/feed-emergency/feed-emergency-state";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

const EXTRAS = ["surface"] as const;

export function FeedEmergencyLogList() {
  const { t } = useI18n();
  const ko = true;
  const lq = useAdminListQuery({ extras: EXTRAS });
  const page = useAdminServerPage<FeedEmergencyLog>(
    `/api/admin/feed-emergency?part=logs&${lq.apiQueryString}`,
    lq.refreshKey
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        pending={page.loading}
      >
        <AdminFilterSelect
          ko={ko}
          label="surface"
          name="surface"
          value={lq.query.extras.surface}
          onChange={(v) => lq.setExtra("surface", v)}
          allLabel={t("common_all")}
          options={[
            { value: "home", label: t("admin_surface_home") },
            { value: "search", label: t("admin_surface_search") },
            { value: "shop", label: t("admin_rec_deploy_shop") },
          ]}
        />
      </AdminFilterBar>
      <AdminServerListFrame
        ko={ko}
        state={page}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        onRetry={lq.refresh}
        onReset={lq.isFiltered ? lq.reset : undefined}
        emptyMessage="긴급 조치 로그가 없습니다."
      >
        {(logs) => (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  액션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  섹션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  담당
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  비고
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {SURFACE_LABELS[l.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {getFeedEmergencyActionLabel(l.actionType)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {l.sectionKey
                      ? SECTION_OVERRIDE_LABELS[l.sectionKey as FeedSectionOverrideKey]
                      : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {l.actorNickname} ({l.actorType})
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {l.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </AdminServerListFrame>
    </div>
  );
}
