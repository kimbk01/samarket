"use client";

/**
 * 관리자 작업 기록 (`/admin/audit-logs`, 설계 v4 F3) — audit_logs 목록.
 * 필터: 기간(PHT) · 행위자 구분(기본 = 사람 작업, 시스템·cron 제외) · 행위자(닉네임/ID) · 대상 종류 · 작업명 검색.
 * 서버 페이지네이션(exact total) · 20/50/100 · 행 클릭 → 상세 드로어(변경 전·후 JSON 은 「기술 정보」).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  AUDIT_LOG_DEFAULT_ACTOR_FILTER,
  type AuditLogActorFilter,
} from "@/lib/admin/audit/admin-audit-log-list-query";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { financeAuditActionLabel, financeAuditTargetLabel } from "@/lib/admin/finance-audit-labels";
import { catalogPair } from "@/lib/i18n/catalog-pair";

type Row = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  actor_nickname?: string | null;
  target_type: string;
  target_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  ip: string | null;
  created_at: string;
};

type ListState =
  | { status: "loading" }
  | { status: "error"; code: string; httpStatus?: number }
  | { status: "ok"; rows: Row[]; total: number };

const EXTRAS = ["actor_type", "actor", "target_type", "target_id"] as const;
type Extra = (typeof EXTRAS)[number];

const ACTOR_OPTIONS: { value: AuditLogActorFilter; ko: string; en: string }[] = [
  { value: "human", ko: "사람 작업 (자동 작업 제외)", en: "People (exclude automated)" },
  { value: "admin", ko: "관리자", en: "Admins" },
  { value: "user", ko: "회원", en: "Members" },
  { value: "system", ko: "자동 작업 (시스템·cron)", en: "Automated (system/cron)" },
  { value: "all", ko: "전체", en: "All" },
];

const ACTOR_TYPE_LABEL: Record<string, { ko: string; en: string }> = {
  admin: catalogPair("admin_admin"),
  user: catalogPair("admin_users_role_badge_member"),
  system: catalogPair("admin_automated"),
  cron: catalogPair("admin_automated"),
};

const FIELD =
  "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px] text-sam-fg";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-sam-muted";

const pht = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

function actionText(r: Row, ko: boolean): string {
  return financeAuditActionLabel(r.action, r.target_type, ko) ?? r.action;
}

function targetText(r: Row, ko: boolean): string {
  return financeAuditTargetLabel(r.target_type, ko) ?? r.target_type;
}

function actorLabel(r: Row, ko: boolean): string {
  const type = ACTOR_TYPE_LABEL[r.actor_type];
  const typeLabel = type ? (ko ? type.ko : type.en) : r.actor_type;
  if (r.actor_nickname) return `${typeLabel} · ${r.actor_nickname}`;
  if (r.actor_id) return `${typeLabel} · ${formatAdminShortId(r.actor_id)}`;
  return typeLabel;
}

function JsonBlock({ label, v }: { label: string; v: unknown }) {
  if (v == null) return null;
  const s = JSON.stringify(v, null, 2);
  if (s === "null" || s === "{}") return null;
  return (
    <div className="mt-2">
      <p className="text-[12px] font-medium">{label}</p>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-sam-app p-2 text-[12px] text-sam-fg">
        {s}
      </pre>
    </div>
  );
}

export function AdminAuditLogsPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery<Extra>({
    extras: EXTRAS,
    extraDefaults: { actor_type: AUDIT_LOG_DEFAULT_ACTOR_FILTER },
  });
  const { query } = lq;

  // 텍스트형 추가 필터(행위자·대상 종류)는 「조회」 때 적용 — 주소 값이 바뀌면 입력값을 다시 맞춘다.
  const appliedKey = `${query.extras.actor}\u0000${query.extras.target_type}`;
  const [textDraft, setTextDraft] = useState({ key: appliedKey, actor: query.extras.actor, targetType: query.extras.target_type });
  let draft = textDraft;
  if (textDraft.key !== appliedKey) {
    draft = { key: appliedKey, actor: query.extras.actor, targetType: query.extras.target_type };
    setTextDraft(draft);
  }

  const [state, setState] = useState<ListState>({ status: "loading" });
  const [openRow, setOpenRow] = useState<Row | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/admin/audit-logs?paged=1&${lq.apiQueryString}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          logs?: Row[];
          total?: number;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setState({ status: "error", code: json.error ?? "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.logs ?? [];
        setState({ status: "ok", rows, total: json.total ?? rows.length });
      } catch {
        if (!cancelled) setState({ status: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey = 조건 + 새로고침 nonce
  }, [lq.apiQueryString, lq.refreshKey]);

  const submit = () =>
    lq.patch({
      q: lq.draft.q,
      from: lq.draft.from,
      to: lq.draft.to,
      extras: { actor: draft.actor.trim(), target_type: draft.targetType.trim() },
    });

  const pending = state.status === "loading";

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_dev_audit" />
      <div
        className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg"
        data-testid="admin-audit-ownership-banner"
      >
        {safeT("admin_audit_ownership_banner")}
      </div>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={submit}
        onReset={lq.reset}
        pending={pending}
        searchPlaceholder={t("admin_audit_logs_action_contains_e_g_revoke")}
      >
        <label className={LABEL}>
          {t("admin_audit_logs_actor_type")}
          <select
            className={FIELD}
            value={query.extras.actor_type}
            onChange={(e) => lq.setExtra("actor_type", e.target.value)}
            data-admin-audit-actor-type="1"
          >
            {ACTOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {ko ? o.ko : o.en}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          {t("admin_audit_logs_actor_nickname_id")}
          <input
            type="search"
            className={FIELD}
            value={draft.actor}
            onChange={(e) => setTextDraft({ ...draft, actor: e.target.value })}
            maxLength={100}
          />
        </label>
        <label className={LABEL}>
          {t("admin_audit_logs_target_type")}
          <input
            type="search"
            className={FIELD}
            value={draft.targetType}
            onChange={(e) => setTextDraft({ ...draft, targetType: e.target.value })}
            placeholder={t("admin_audit_logs_e_g_staff_store_order")}
            maxLength={120}
          />
        </label>
      </AdminFilterBar>

      {query.extras.target_id ? (
        <p className="text-[13px] text-sam-muted">
          {t("admin_audit_logs_filtered_to_one_target")} ·{" "}
          <AdminActionButton variant="quiet" size="sm" onClick={() => lq.setExtra("target_id", "")}>
            {t("admin_audit_logs_clear_target")}
          </AdminActionButton>
        </p>
      ) : null}

      {state.status === "loading" ? (
        <AdminLoadingState ko={ko} />
      ) : state.status === "error" ? (
        <AdminErrorState
          ko={ko}
          code={state.code}
          httpStatus={state.httpStatus}
          onRetry={lq.refresh}
        />
      ) : state.rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_audit_no_logs")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[760px] border-collapse text-[14px]" data-admin-audit-table="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[13px] text-sam-muted">
                <th className="px-3 py-2 font-medium">{t("admin_audit_logs_time_pht")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_audit_logs_actor")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_audit_logs_action")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_audit_logs_target")}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app"
                  onClick={() => setOpenRow(r)}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-sam-muted">{pht(r.created_at)}</td>
                  <td className="px-3 py-2">{actorLabel(r, ko)}</td>
                  <td className="px-3 py-2">
                    <AdminActionButton variant="ghost" size="sm" className="!px-0 text-left">
                      {actionText(r, ko)}
                    </AdminActionButton>
                  </td>
                  <td className="px-3 py-2 text-sam-muted">{targetText(r, ko)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.status === "ok" && state.total > 0 ? (
        <AdminPagination
          ko={ko}
          page={query.page}
          size={query.size}
          total={state.total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={pending}
        />
      ) : null}

      <AdminDetailDrawer
        open={openRow != null}
        onClose={() => setOpenRow(null)}
        ko={ko}
        title={openRow ? actionText(openRow, ko) : ""}
        subtitle={openRow ? pht(openRow.created_at) : undefined}
        primaryActions={
          openRow ? (
            <Link href={`/admin/audit-logs/${openRow.id}`} className="text-[13px] font-medium underline">
              {t("admin_audit_logs_open_detail_page")}
            </Link>
          ) : null
        }
      >
        {openRow ? (
          <div className="space-y-2 text-[14px]">
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-sam-muted">{t("admin_audit_logs_time")}</dt>
              <dd>{pht(openRow.created_at)}</dd>
              <dt className="text-sam-muted">{t("admin_audit_logs_actor")}</dt>
              <dd>{actorLabel(openRow, ko)}</dd>
              <dt className="text-sam-muted">{t("admin_audit_logs_action")}</dt>
              <dd>{actionText(openRow, ko)}</dd>
              <dt className="text-sam-muted">{t("admin_audit_logs_target_type")}</dt>
              <dd>{targetText(openRow, ko)}</dd>
            </dl>
            <AdminTechDetails ko={ko}>
              <p>log id: {openRow.id}</p>
              <p>action: {openRow.action}</p>
              <p>target_type: {openRow.target_type}</p>
              <p>actor_type: {openRow.actor_type}</p>
              <p>actor_id: {openRow.actor_id ?? "—"}</p>
              <p>target_id: {openRow.target_id}</p>
              {openRow.ip ? <p>ip: {openRow.ip}</p> : null}
              <JsonBlock label={t("admin_audit_json_before")} v={openRow.before_json} />
              <JsonBlock label={t("admin_audit_json_after")} v={openRow.after_json} />
            </AdminTechDetails>
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
