"use client";

/**
 * 모임 목록 (설계 moim §8) — 탭: 전체·정상·추천 제외·경고·차단·종료·삭제 / 필터: 동네·카테고리·개설일·신고 수·마지막 활동 /
 * 검색: 모임 이름·모임장(닉네임·DIBAY ID)·모임 id / CSV 내보내기(감사 기록). 권한 키 `moim`.
 */
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  MOIM_ADMIN_ACTIVITY_FILTERS,
  MOIM_ADMIN_LIST_TABS,
  MOIM_ADMIN_REPORT_MIN_OPTIONS,
  type MoimAdminCategoryRow,
  type MoimAdminListRow,
} from "@/lib/admin/moim/moim-admin-contract";
import { MoimAdminPersonCell, MoimPlatformBadge, MoimStatusBadge } from "@/components/admin/moim/admin-moim-shared";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  rows?: MoimAdminListRow[];
  facets?: { lgus: { id: string; label: string }[]; categories: MoimAdminCategoryRow[] } | null;
};

const EXTRAS = ["tab", "lgu", "category", "reports", "activity"] as const;

export function AdminMoimListPage() {
  const { t, language } = useI18n();
  const q = useCommunityListQuery({ extras: EXTRAS });
  const tab = q.query.extras.tab || "all";
  const params = q.apiParams();
  params.set("facets", "1");
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/moim/moims?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const facets = state.data?.facets ?? null;

  const csvParams = q.apiParams();
  csvParams.delete("limit");
  csvParams.delete("offset");
  csvParams.set("format", "csv");

  const any = { value: "", label: t("admin_moim_filter_any") };

  return (
    <CommunityListShell
      title={t("admin_moim_list_title")}
      description={t("admin_moim_list_desc")}
      actions={
        <AdminActionButton variant="secondary" size="sm" onClick={() => window.open(`/api/admin/moim/moims?${csvParams.toString()}`, "_blank")}>
          {t("admin_moim_csv_export")}
        </AdminActionButton>
      }
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => q.setExtra("tab", v === "all" ? "" : v)}
          tabs={MOIM_ADMIN_LIST_TABS.map((v) => ({ value: v, label: t(`admin_moim_tab_${v}` as MessageKey) }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={q} searchPlaceholder={t("admin_moim_search_placeholder")} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_moim_filter_lgu")}>
            <CommunitySelect
              value={q.query.extras.lgu}
              onChange={(v) => q.setExtra("lgu", v)}
              options={[any, ...(facets?.lgus ?? []).map((l) => ({ value: l.id, label: l.label }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={t("admin_moim_filter_category")}>
            <CommunitySelect
              value={q.query.extras.category}
              onChange={(v) => q.setExtra("category", v)}
              options={[any, ...(facets?.categories ?? []).map((c) => ({ value: c.id, label: language === "en" ? c.labelEn : c.labelKo }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={t("admin_moim_filter_reports")}>
            <CommunitySelect
              value={q.query.extras.reports}
              onChange={(v) => q.setExtra("reports", v)}
              options={[any, ...MOIM_ADMIN_REPORT_MIN_OPTIONS.map((n) => ({ value: n, label: t("admin_moim_filter_reports_min", { n }) }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={t("admin_moim_filter_activity")}>
            <CommunitySelect
              value={q.query.extras.activity}
              onChange={(v) => q.setExtra("activity", v)}
              options={[any, ...MOIM_ADMIN_ACTIVITY_FILTERS.map((v) => ({ value: v, label: t(`admin_moim_activity_${v}` as MessageKey) }))]}
            />
          </CommunityFilterField>
        </CommunityFilterBar>
      }
      banner={<p className="text-[12px] text-sam-muted">{t("admin_moim_list_period_note")}</p>}
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody
        state={state}
        empty={rows.length === 0}
        lq={q}
        onRetry={reload}
        emptyMessage={t("admin_moim_list_empty")}
        filteredEmptyMessage={t("admin_moim_list_filtered_empty")}
      >
        <CommunityTable
          head={[
            t("admin_moim_col_name"),
            t("admin_moim_col_state"),
            t("admin_moim_col_category"),
            t("admin_moim_col_lgu"),
            t("admin_moim_col_members"),
            t("admin_moim_col_host"),
            t("admin_moim_col_reports"),
            t("admin_moim_col_last_activity"),
            t("admin_moim_col_created"),
          ]}
        >
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className={COMMUNITY_TD}>
                <Link href={communityDetailHref(`/admin/community/moims/${encodeURIComponent(r.id)}`, q.selfHref)} className="font-medium text-sam-info hover:underline">
                  {r.name}
                </Link>
                <div className="sam-text-xxs text-sam-muted">{r.id}</div>
              </td>
              <td className={COMMUNITY_TD}>
                <div className="flex flex-wrap gap-1">
                  <MoimStatusBadge value={r.status} />
                  <MoimPlatformBadge value={r.platformState} />
                </div>
              </td>
              <td className={COMMUNITY_TD}>{(language === "en" ? r.categoryLabelEn : r.categoryLabelKo) ?? "—"}</td>
              <td className={COMMUNITY_TD}>{r.lguLabel ?? r.lguId}</td>
              <td className={COMMUNITY_TD}>
                {r.capacity ? t("admin_moim_members_of", { n: r.memberCount, cap: r.capacity }) : r.memberCount}
              </td>
              <td className={COMMUNITY_TD}>
                <MoimAdminPersonCell person={r.host} />
              </td>
              <td className={COMMUNITY_TD}>{r.reportCount}</td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.lastActivityAt} />
              </td>
              <td className={COMMUNITY_TD}>{formatAdminManilaDateTime(r.createdAt).slice(0, 10)}</td>
            </tr>
          ))}
        </CommunityTable>
      </CommunityListBody>
    </CommunityListShell>
  );
}
