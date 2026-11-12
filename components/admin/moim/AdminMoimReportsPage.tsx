"use client";

/**
 * 모임 신고 큐 (설계 moim §8 「모임 신고 처리」) — M5 읽기 + M6 처리.
 * 상태 탭(접수·검토 중·조치·기각) · 대상 유형 필터 · 같은 모임 묶음 보기 · 상세 서랍(대상 미리보기·사유·신고자·같은 대상 이력·처리 폼).
 * M6: 모임 채팅방 메신저 신고 보기(설계 P11 — 읽기 전용, 처리는 기존 메신저 신고 화면).
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  MOIM_ADMIN_REPORT_STATUSES,
  MOIM_ADMIN_REPORT_TARGET_TYPES,
  type MoimAdminPerson,
} from "@/lib/admin/moim/moim-admin-contract";
import { MoimAdminNote, MoimAdminPersonCell, MoimAdminTime, moimReasonCodeLabel, moimRoleKey } from "@/components/admin/moim/admin-moim-shared";
import { MoimReportDecisionPanel, type MoimReportDecisionBanner, type MoimReportResultAction } from "@/components/admin/moim/AdminMoimReportDecisionForm";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";

type MoimRef = { name: string; status: string; platformState: string } | null;
type ReportRow = {
  id: string;
  moim_id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  detail: string | null;
  status: string;
  created_at: string;
  reporter: MoimAdminPerson | null;
  moim: MoimRef;
};
type GroupRow = { moimId: string; count: number; latestAt: string; types: Record<string, number>; moim: MoimRef };
/** 모임 채팅방(owner_domain='moim')의 메신저 신고 — 읽기 전용 */
type MessengerRow = {
  id: string;
  report_type: string;
  room_id: string | null;
  message_id: string | null;
  reason_type: string;
  reason_detail: string;
  status: string;
  created_at: string;
  moimId: string | null;
  scheduleId: string | null;
  moim: MoimRef;
  reporter: MoimAdminPerson | null;
  reported: MoimAdminPerson | null;
};
type ListResponse = { ok?: boolean; error?: string; total?: number; capped?: boolean; rows?: (ReportRow | GroupRow | MessengerRow)[] };

/** 메신저 신고 처리 화면 (기존 메신저 신고 큐 — 방 대상으로 거름) */
function messengerQueueHref(roomId: string): string {
  return `/admin/chats/reported?type=messenger&status=all&target=${encodeURIComponent(roomId)}`;
}

const EXTRAS = ["type", "view", "reportId", "moimId"] as const;

export function AdminMoimReportsPage() {
  const { t, language } = useI18n();
  const q = useCommunityListQuery({
    extras: EXTRAS,
    statuses: MOIM_ADMIN_REPORT_STATUSES,
    defaults: { status: "received" },
    keepOnReset: { status: true },
  });
  const status = q.query.status || "received";
  const view = q.query.extras.view === "group" ? "group" : q.query.extras.view === "messenger" ? "messenger" : "list";
  const params = q.apiParams({ period: false, omit: ["reportId"] });
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/moim/reports?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const reportId = q.query.extras.reportId;
  const moimFilter = q.query.extras.moimId;

  return (
    <CommunityListShell
      title={t("admin_moim_reports_title")}
      description={t("admin_moim_reports_desc")}
      actions={
        <div className="flex flex-wrap gap-2">
          <AdminActionButton size="sm" variant="secondary" onClick={() => q.setExtra("view", view === "group" ? "" : "group")}>
            {t(view === "group" ? "admin_moim_reports_view_list" : "admin_moim_reports_view_group")}
          </AdminActionButton>
          <AdminActionButton size="sm" variant="secondary" onClick={() => q.setExtra("view", view === "messenger" ? "" : "messenger")}>
            {t(view === "messenger" ? "admin_moim_reports_view_list" : "admin_moim_reports_view_messenger")}
          </AdminActionButton>
        </div>
      }
      banner={
        <div className="space-y-2">
          {view === "messenger" ? <MoimAdminNote>{t("admin_moim_reports_messenger_note")}</MoimAdminNote> : null}
          {state.data?.capped ? <MoimAdminNote>{t("admin_moim_reports_capped_note")}</MoimAdminNote> : null}
          {moimFilter ? (
            <div className="flex items-center gap-2 text-[13px]">
              <span>{t("admin_moim_reports_moim_filter")}</span>
              <AdminActionButton size="sm" variant="quiet" onClick={() => q.setExtra("moimId", "")}>
                {t("admin_moim_filter_clear")}
              </AdminActionButton>
            </div>
          ) : null}
        </div>
      }
      tabs={
        <CommunityTabs
          value={status}
          onChange={q.setStatus}
          tabs={MOIM_ADMIN_REPORT_STATUSES.map((s) => ({ value: s, label: t(`admin_moim_report_status_${s}` as MessageKey) }))}
        />
      }
      filters={
        <CommunityFilterField label={t("admin_moim_col_target")}>
          <CommunitySelect
            value={q.query.extras.type}
            onChange={(v) => q.setExtra("type", v)}
            options={[{ value: "", label: t("admin_moim_filter_any") }, ...MOIM_ADMIN_REPORT_TARGET_TYPES.map((v) => ({ value: v, label: t(`admin_moim_target_${v}` as MessageKey) }))]}
          />
        </CommunityFilterField>
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_moim_reports_empty")}>
        {view === "messenger" ? (
          <CommunityTable
            head={[t("admin_moim_col_target"), t("admin_moim_col_name"), t("admin_moim_col_reason"), t("admin_moim_col_reporter"), t("admin_moim_col_status"), t("admin_moim_col_created")]}
          >
            {(rows as MessengerRow[]).map((r) => {
              const ko = language === "ko";
              return (
                <tr key={r.id} className="border-b border-sam-border-soft align-top">
                  <td className={COMMUNITY_TD}>
                    <div>{adminChatLabel("report_target", r.report_type, ko).label}</div>
                    {r.room_id ? (
                      <Link href={messengerQueueHref(r.room_id)} className="text-[12px] text-sam-primary hover:underline">
                        {t("admin_moim_reports_messenger_open")}
                      </Link>
                    ) : null}
                  </td>
                  <td className={COMMUNITY_TD}>
                    {r.moimId ? (
                      <Link href={`/admin/community/moims/${encodeURIComponent(r.moimId)}`} className="text-sam-primary hover:underline">
                        {r.moim?.name ?? r.moimId}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {r.scheduleId ? <div className="text-[12px] text-sam-muted">{t("admin_moim_reports_messenger_schedule_room")}</div> : null}
                  </td>
                  <td className={`${COMMUNITY_TD} max-w-[320px]`}>
                    <div>{adminChatLabel("report_reason", r.reason_type, ko).label}</div>
                    {r.reason_detail ? <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.reason_detail}</div> : null}
                  </td>
                  <td className={COMMUNITY_TD}>
                    <MoimAdminPersonCell person={r.reporter} />
                  </td>
                  <td className={COMMUNITY_TD}>{adminChatLabel("report_status", r.status, ko).label}</td>
                  <td className={COMMUNITY_TD}>
                    <MoimAdminTime iso={r.created_at} />
                  </td>
                </tr>
              );
            })}
          </CommunityTable>
        ) : view === "group" ? (
          <CommunityTable head={[t("admin_moim_col_name"), t("admin_moim_col_reports"), t("admin_moim_col_types"), t("admin_moim_col_latest")]}>
            {(rows as GroupRow[]).map((g) => (
              <tr key={g.moimId} className="border-b border-sam-border-soft align-top">
                <td className={COMMUNITY_TD}>
                  <Link href={`/admin/community/moims/${encodeURIComponent(g.moimId)}?tab=reports`} className="font-medium text-sam-info hover:underline">
                    {g.moim?.name ?? g.moimId}
                  </Link>
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionButton variant="ghost" size="sm" className="h-auto! px-0!" onClick={() => q.patch({ extras: { view: "", moimId: g.moimId } })}>
                    {g.count}
                  </AdminActionButton>
                </td>
                <td className={COMMUNITY_TD}>
                  {Object.entries(g.types)
                    .map(([k, n]) => `${t(`admin_moim_target_${k}` as MessageKey)} ${n}`)
                    .join(" · ")}
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={g.latestAt} />
                </td>
              </tr>
            ))}
          </CommunityTable>
        ) : (
          <CommunityTable head={[t("admin_moim_col_target"), t("admin_moim_col_name"), t("admin_moim_col_reason"), t("admin_moim_col_reporter"), t("admin_moim_col_created")]}>
            {(rows as ReportRow[]).map((r) => (
              <tr key={r.id} className="border-b border-sam-border-soft align-top">
                <td className={COMMUNITY_TD}>
                  <AdminActionButton variant="ghost" size="sm" className="h-auto! px-0!" onClick={() => q.setExtra("reportId", r.id)}>
                    {t(`admin_moim_target_${r.target_type}` as MessageKey)}
                  </AdminActionButton>
                </td>
                <td className={COMMUNITY_TD}>
                  <Link href={`/admin/community/moims/${encodeURIComponent(r.moim_id)}`} className="text-sam-primary hover:underline">
                    {r.moim?.name ?? r.moim_id}
                  </Link>
                </td>
                <td className={`${COMMUNITY_TD} max-w-[320px]`}>
                  <div>{moimReasonCodeLabel(t, r.reason_code)}</div>
                  {r.detail ? <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.detail}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminPersonCell person={r.reporter} />
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.created_at} />
                </td>
              </tr>
            ))}
          </CommunityTable>
        )}
      </CommunityListBody>
      {reportId ? <ReportDrawer key={reportId} reportId={reportId} onClose={() => q.setExtra("reportId", "")} onChanged={reload} /> : null}
    </CommunityListShell>
  );
}

type DetailResponse = {
  ok?: boolean;
  error?: string;
  report: ReportRow & { handler: MoimAdminPerson | null; handled_at: string | null };
  target: Record<string, unknown> | null;
  history: { id: string; reason_code: string; detail: string | null; status: string; created_at: string; reporter: MoimAdminPerson | null }[];
  openSameTargetCount: number | null;
  warnCount: number | null;
  host: MoimAdminPerson | null;
  resultActions: MoimReportResultAction[];
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function TargetPreview({ target }: { target: Record<string, unknown> | null }) {
  const { t } = useI18n();
  if (!target) return <p className="text-[13px] text-sam-muted">{t("admin_moim_report_target_missing")}</p>;
  const images = Array.isArray(target.images) ? (target.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const url = str(target.url) ?? str(target.cover_image_url);
  const title = str(target.title) ?? str(target.name) ?? str(target.nickname);
  const body = str(target.body) ?? str(target.content) ?? str(target.intro) ?? str(target.description) ?? str(target.bio);
  const history = Array.isArray(target.profileHistory) ? (target.profileHistory as { nickname: string; changed_at: string }[]) : [];
  return (
    <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-sam-muted">
        <span>{t(`admin_moim_target_${String(target.type)}` as MessageKey)}</span>
        {str(target.status) ? <span>· {String(target.status)}</span> : null}
        {target.is_hidden_by_admin === true ? <span>· {t("admin_moim_message_hidden")}</span> : null}
        {str(target.deleted_at) ? <span>· {t("admin_moim_message_deleted")}</span> : null}
        {str(target.authorNickname) ? <span>· {String(target.authorNickname)}</span> : null}
        {str(target.role) ? <span>· {t(moimRoleKey(String(target.role)))}</span> : null}
      </div>
      {title ? <div className="font-semibold text-sam-fg">{title}</div> : null}
      {body ? <p className="whitespace-pre-wrap text-sam-fg [overflow-wrap:anywhere]">{body}</p> : null}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 운영자 확인용 미리보기 (외부 저장소 URL)
        <img src={url} alt="" className="max-h-60 rounded-ui-rect object-contain" />
      ) : null}
      {images.length ? (
        <div className="flex flex-wrap gap-1">
          {images.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element -- 운영자 확인용 미리보기 (외부 저장소 URL)
            <img key={u} src={u} alt="" className="h-20 w-20 rounded-ui-rect object-cover" />
          ))}
        </div>
      ) : null}
      {str(target.starts_at) ? (
        <div className="text-[12px] text-sam-muted">
          <MoimAdminTime iso={String(target.starts_at)} /> {str(target.place_text) ?? ""}
        </div>
      ) : null}
      {target.account ? <MoimAdminPersonCell person={target.account as MoimAdminPerson} /> : null}
      {history.length ? (
        <div className="text-[12px] text-sam-muted">
          {t("admin_moim_profile_history_title")}: {history.map((h) => h.nickname).join(" → ")}
        </div>
      ) : null}
      {str(target.room_id) ? (
        <Link href={`/admin/chats/messenger/${encodeURIComponent(String(target.room_id))}`} className="text-sam-primary hover:underline">
          {t("admin_moim_open_chat")}
        </Link>
      ) : null}
    </div>
  );
}

function ReportDrawer({ reportId, onClose, onChanged }: { reportId: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [banner, setBanner] = useState<MoimReportDecisionBanner>(null);
  const { state, reload } = useCommunityAdminJson<DetailResponse>(`/api/admin/moim/reports/${encodeURIComponent(reportId)}`);
  const d = state.status === "ok" ? state.data : null;
  return (
    <AdminFormSheet title={t("admin_moim_report_detail_title")} onClose={onClose}>
      {state.status === "loading" && !d ? <AdminLoadingState ko /> : null}
      {state.status === "error" ? <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} /> : null}
      {d ? (
        <div className="space-y-4 text-[13px]">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-sam-muted">{t("admin_moim_col_name")}</dt>
              <dd>
                <Link href={`/admin/community/moims/${encodeURIComponent(d.report.moim_id)}`} className="text-sam-primary hover:underline">
                  {d.report.moim?.name ?? d.report.moim_id}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_moim_col_status")}</dt>
              <dd>{t(`admin_moim_report_status_${d.report.status}` as MessageKey)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_moim_col_reason")}</dt>
              <dd>
                {moimReasonCodeLabel(t, d.report.reason_code)}
                {d.report.detail ? <div className="whitespace-pre-wrap text-sam-muted [overflow-wrap:anywhere]">{d.report.detail}</div> : null}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_moim_col_reporter")}</dt>
              <dd>
                <MoimAdminPersonCell person={d.report.reporter} />
                <MoimAdminTime iso={d.report.created_at} />
              </dd>
            </div>
          </dl>
          <section className="space-y-1">
            <h3 className="font-semibold text-sam-fg">{t("admin_moim_report_target_preview")}</h3>
            <TargetPreview target={d.target} />
          </section>
          <section className="space-y-1">
            <h3 className="font-semibold text-sam-fg">{t("admin_moim_report_same_target", { n: d.history.length })}</h3>
            <ul className="space-y-1">
              {d.history.map((h) => (
                <li key={h.id} className="rounded-ui-rect border border-sam-border-soft px-2 py-1.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{moimReasonCodeLabel(t, h.reason_code)} · {t(`admin_moim_report_status_${h.status}` as MessageKey)}</span>
                    <MoimAdminTime iso={h.created_at} />
                  </div>
                  <MoimAdminPersonCell person={h.reporter} />
                  {h.detail ? <div className="whitespace-pre-wrap text-sam-muted [overflow-wrap:anywhere]">{h.detail}</div> : null}
                </li>
              ))}
            </ul>
          </section>
          <MoimReportDecisionPanel
            ctx={{
              reportId: d.report.id,
              status: d.report.status,
              targetType: d.report.target_type,
              handledAt: d.report.handled_at ?? null,
              handler: d.report.handler,
              host: d.host ?? null,
              warnCount: d.warnCount ?? null,
              openSameTargetCount: d.openSameTargetCount ?? null,
              resultActions: d.resultActions ?? [],
            }}
            banner={banner}
            setBanner={setBanner}
            onChanged={() => {
              reload();
              onChanged();
            }}
          />
        </div>
      ) : null}
    </AdminFormSheet>
  );
}
