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
  admin: { ko: "관리자", en: "Admin" },
  user: { ko: "회원", en: "Member" },
  system: { ko: "자동 작업", en: "Automated" },
  cron: { ko: "자동 작업", en: "Automated" },
};

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] px-2.5 text-[16px] text-[var(--admin-console-fg,#1f2937)]";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted,#667085)]";

const pht = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

function actorLabel(r: Row, ko: boolean): string {
  const type = ACTOR_TYPE_LABEL[r.actor_type];
  const typeLabel = type ? (ko ? type.ko : type.en) : r.actor_type;
  if (r.actor_nickname) return `${typeLabel} · ${r.actor_nickname}`;
  if (r.actor_id) return `${typeLabel} · ${r.actor_id.slice(0, 8)}`;
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
      <AdminPageHeader titleKey="admin_page_log_audit" />
      <div
        className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
        data-testid="admin-audit-ownership-banner"
      >
        {safeT("admin_audit_ownership_banner", {
          fallbackKo:
            "COMMON storage convention · audit_logs 테이블입니다. Domain별 전용 ledger(신고/정산/Feed 재무 등)를 모두 담는 통합 원장이 아닙니다. 대상 Domain 화면의 원장을 우선하세요.",
          fallbackEn:
            "COMMON storage convention · audit_logs table. Not a unified ledger of every Domain (reports/settlements/Feed finance). Prefer each Domain’s own ledger.",
        })}
      </div>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={submit}
        onReset={lq.reset}
        pending={pending}
        searchPlaceholder={ko ? "작업명 일부 (예: revoke)" : "Action contains (e.g. revoke)"}
      >
        <label className={LABEL}>
          {ko ? "행위자 구분" : "Actor type"}
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
          {ko ? "행위자 (닉네임·ID)" : "Actor (nickname/ID)"}
          <input
            type="search"
            className={FIELD}
            value={draft.actor}
            onChange={(e) => setTextDraft({ ...draft, actor: e.target.value })}
            maxLength={100}
          />
        </label>
        <label className={LABEL}>
          {ko ? "대상 종류" : "Target type"}
          <input
            type="search"
            className={FIELD}
            value={draft.targetType}
            onChange={(e) => setTextDraft({ ...draft, targetType: e.target.value })}
            placeholder={ko ? "예: staff, store_order" : "e.g. staff, store_order"}
            maxLength={120}
          />
        </label>
      </AdminFilterBar>

      {query.extras.target_id ? (
        <p className="text-[13px] text-sam-muted">
          {ko ? "특정 대상만 보는 중" : "Filtered to one target"} ·{" "}
          <button type="button" className="underline" onClick={() => lq.setExtra("target_id", "")}>
            {ko ? "대상 조건 해제" : "Clear target"}
          </button>
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
        <AdminEmptyState ko={ko} message={t("admin_audit_no_logs")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[760px] border-collapse text-[14px]" data-admin-audit-table="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[13px] text-sam-muted">
                <th className="px-3 py-2 font-medium">{ko ? "일시 (PHT)" : "Time (PHT)"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "행위자" : "Actor"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "작업" : "Action"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "대상" : "Target"}</th>
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
                    <button type="button" className="text-left font-medium text-sam-fg hover:underline">
                      {r.action}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-sam-muted">{r.target_type}</td>
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
        title={openRow?.action ?? ""}
        subtitle={openRow ? pht(openRow.created_at) : undefined}
        primaryActions={
          openRow ? (
            <Link href={`/admin/audit-logs/${openRow.id}`} className="text-[13px] font-medium underline">
              {ko ? "상세 화면" : "Open detail page"}
            </Link>
          ) : null
        }
      >
        {openRow ? (
          <div className="space-y-2 text-[14px]">
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-sam-muted">{ko ? "일시" : "Time"}</dt>
              <dd>{pht(openRow.created_at)}</dd>
              <dt className="text-sam-muted">{ko ? "행위자" : "Actor"}</dt>
              <dd>{actorLabel(openRow, ko)}</dd>
              <dt className="text-sam-muted">{ko ? "작업" : "Action"}</dt>
              <dd>{openRow.action}</dd>
              <dt className="text-sam-muted">{ko ? "대상 종류" : "Target type"}</dt>
              <dd>{openRow.target_type}</dd>
            </dl>
            <AdminTechDetails ko={ko}>
              <p>log id: {openRow.id}</p>
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
